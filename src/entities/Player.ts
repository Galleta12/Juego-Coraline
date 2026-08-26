import Phaser from "phaser";
import { COFFEE, PLAYER } from "@/config/game";
import { hasArt, heroKey } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { DEFAULT_SKIN, getState, isCoffeeActive, type Skin } from "@/systems/GameState";
import type { Input } from "@/systems/Input";
import { Weapon } from "@/entities/Weapon";
import { dust } from "@/ui/Effects";

/** El arte de la heroina mide 200px de alto; en juego queremos ~100. */
const ART_SCALE = 0.5;

/**
 * Cuanto se hunde el dibujo en el suelo, en pixeles de mundo.
 *
 * Medido: los pies caen exactamente sobre el tile, cero de hueco. Pero
 * el contorno oscuro que el pipeline le pone al sprite se lee como una
 * franja de aire y parece que flota. Metiendola tres pixeles el pie se
 * solapa con el borde del tile y toca de verdad.
 */
const FOOT_SINK = 3;

/**
 * Margen para dar el suelo por bueno, en milisegundos.
 *
 * `blocked.down` parpadea: apoyada y quieta, Arcade la separa del tile y
 * durante un frame no toca nada, cayendo a 30 px/s. Con las poses viejas
 * daba igual — todas las del salto estaban agachadas y no se notaba la
 * diferencia — pero ahora la del aire y la de aterrizar son distintas, y
 * de pie el personaje temblaba entre las dos. Peor aun: cada parpadeo
 * contaba como aterrizaje y repetia el polvo y el golpe una y otra vez.
 *
 * Mismo margen que el coyote del salto, y por la misma razon: durante
 * esa ventana el juego la considera pisando suelo, asi que lo coherente
 * es que tambien se la vea de pie.
 */
const GROUND_GRACE = PLAYER.coyoteMs;

/**
 * Cuanto tarda en poder volver a aterrizar.
 *
 * Al caer fuerte rebota una vez: toca, se queda un par de frames y se
 * despega ~130 ms antes de asentarse. Sin este freno eso cuenta como un
 * segundo aterrizaje y suenan dos golpes seguidos con su polvo.
 */
const LANDING_COOLDOWN = 320;

/**
 * Donde tiene la mano, en fraccion de su altura de pie.
 *
 * A la altura de la mano que le cuelga andando, que es tambien donde
 * lleva los punos al correr. Antes iba a 0,62 del alto del CUERPO
 * FISICO — que no es su altura — y el arma le quedaba a la altura de
 * las rodillas; midiendola por el fogonazo de las poses de disparo
 * salia 0,75 y entonces le tapaba la cara, porque en esas poses va
 * inclinada y la cabeza le queda mas baja.
 *
 * Se mide contra la figura DE PIE y no contra el fotograma de turno: si
 * no, en la pose del aire — que va recogida y mide menos — el arma se
 * le caeria a las rodillas justo mientras salta.
 */
const HAND_UP = 0.55;
const HAND_FORWARD = 16;

/**
 * La agente.
 *
 * El tacto del salto es lo unico que la jugadora nota de verdad, asi que
 * lleva las tres ayudas clasicas: coyote time, buffer de salto y altura
 * variable. Son invisibles y son la diferencia entre un salto que
 * engancha y uno que molesta.
 *
 * El cuerpo mira hacia donde apunta el raton, no hacia donde camina:
 * con apuntado libre, mirar al lado contrario del disparo se lee como
 * un error.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  readonly weapon: Weapon;

  private readonly skin: Skin;
  private lastGroundedAt = -Infinity;
  private jumpCutUsed = false;
  private invulnerableUntil = 0;
  private facing: 1 | -1 = 1;
  private locked = false;
  private stepTimer = 0;
  private dropUntil = 0;
  private wasAirborne = false;
  /** Mientras dure, se ve la pose de aterrizaje. */
  private landingUntil = 0;
  /** Alto del dibujo de pie, para colgar de ahi la mano. */
  private readonly standHeight: number;
  private lastLandedAt = -Infinity;
  /** Mientras dure, se ve la pose de recibir un golpe. */
  private hurtUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const skin = getState().selectedHero ?? DEFAULT_SKIN;
    // La textura de arranque tiene que ser una pose que EXISTA en el
    // manifiesto, no el nombre de una animacion — y de pie, que es como
    // se la ve el primer instante, antes de que `registerAnimations` ni
    // siquiera haya montado el ciclo de reposo.
    super(scene, x, y, heroKey(skin, "idle-1"));
    this.skin = skin;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(20);

    // El cuerpo fisico es mas estrecho que el dibujo: el pelo y el
    // abrigo no deberian chocar contra las paredes. Las medidas se leen
    // de la textura y no se fijan a mano, porque el lienzo del pack
    // cambia cada vez que se reprocesa el arte.
    this.body.setSize(PLAYER.width / ART_SCALE, PLAYER.height / ART_SCALE);
    this.syncBody();
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocity(600, 1400);

    // Antes de animar nada: la textura de arranque es la pose de pie,
    // asi que este es su alto de verdad.
    this.standHeight = this.displayHeight;

    this.registerAnimations();
    this.play(this.anim("idle"));

    this.weapon = new Weapon(scene);
    this.weapon.setVisible(false);
  }

  private anim(name: string): string {
    return `hero-${this.skin}-${name}`;
  }

  /**
   * Recoloca el cuerpo bajo sus pies. Hay que llamarlo en cada frame.
   *
   * Cada pose es una imagen suelta y mide distinto de alto — 260 px de
   * pie, 181 cayendo, 188 recogida en el aire — y el desplazamiento del
   * cuerpo se calculaba UNA vez, con la de pie. Al cambiar de animacion
   * el cuerpo se iba hasta 40 px por debajo de los pies o por encima de
   * ellos, la fisica la sacaba del suelo de un empujon y la heroina
   * pegaba un brinco: al aterrizar se hundia y volvia a caer, con su
   * segundo golpe y su segunda nube de polvo.
   *
   * Con el origen abajo, mantener el cuerpo pegado a los pies es dejar
   * su base a la misma distancia del borde inferior del dibujo, sea el
   * dibujo que sea.
   */
  private syncBody(): void {
    const bw = PLAYER.width / ART_SCALE;
    const bh = PLAYER.height / ART_SCALE;
    this.body.setOffset(
      (this.width - bw) / 2,
      this.height - bh - FOOT_SINK / ART_SCALE,
    );
  }

  private registerAnimations(): void {
    const a = this.scene.anims;
    const make = (
      name: string,
      poses: string[],
      frameRate: number,
      repeat: number,
      yoyo = false,
    ) => {
      const key = this.anim(name);
      if (a.exists(key)) return;
      a.create({
        key,
        frames: poses.map((p) => ({ key: heroKey(this.skin, p) })),
        frameRate,
        repeat,
        yoyo,
      });
    };
    // Quieta, de pie: la animacion de reposo de verdad, no un dibujo
    // fijo con un balanceo puesto por codigo encima.
    //
    // Las dos hojas de idle no traen el mismo numero de fotogramas — la
    // rubia cinco, la pelirroja seis — asi que la lista se arma mirando
    // cuales existen para esta piel en vez de tener el numero a mano.
    //
    // Con `yoyo`, no en bucle cerrado: la secuencia es un barrido — el
    // pelo asentandose — y no un ciclo que empalme solo. Cortar de la
    // ultima pose a la primera daria un salto; yendo y viniendo nunca
    // hay una costura que se note.
    const idlePoses = Array.from({ length: 6 }, (_, i) => `idle-${i + 1}`).filter((p) =>
      hasArt(heroKey(this.skin, p)),
    );
    make("idle", idlePoses.length ? idlePoses : ["walk-1"], 6, -1, true);
    // Andar, el ciclo entero de seis tiempos.
    make("walk", ["walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6"], 11, -1);
    // Correr queda para cuando el cafe esta activo: se nota que va
    // disparada sin tener que mirar el marcador.
    make("run", ["run-1", "run-2", "run-3", "run-4", "run-5", "run-6"], 15, -1);
    // El salto, por partes. Cada pose se ve en su momento y solo en
    // el suyo: subiendo la del impulso, arriba la del AIRE, bajando la
    // de caida y al tocar suelo la de aterrizar.
    //
    // Antes las cuatro poses del salto venian de una hoja donde todas
    // estaban en cuclillas, asi que daba igual cual se pusiera: la
    // heroina saltaba agachada. Las laminas nuevas traen el aire y el
    // aterrizaje dibujados aparte, y por eso ahora el salto se lee.
    make("rise", ["jump-rise"], 1, 0);
    make("air", ["jump-air"], 1, 0);
    make("fall", ["jump-fall"], 1, 0);
    make("land", ["jump-land"], 1, 0);
    make("hurt", ["hit-1", "hit-2", "hit-3"], 10, 0);
  }

  /* ── Estado ──────────────────────────────────────────────────────── */

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnerableUntil;
  }

  get direction(): 1 | -1 {
    return this.facing;
  }

  /** Punto donde va anclada el arma: su mano. */
  handPosition(): { x: number; y: number } {
    return {
      x: this.x + this.facing * HAND_FORWARD,
      y: this.y - this.standHeight * HAND_UP,
    };
  }

  lockControls(locked: boolean): void {
    this.locked = locked;
    if (locked) this.setVelocityX(0);
  }

  /** Lo consulta el QA para saber cuando acaba una escena guionizada. */
  get controlsLocked(): boolean {
    return this.locked;
  }

  /* ── Ciclo ───────────────────────────────────────────────────────── */

  tick(input: Input, delta: number): void {
    const now = this.scene.time.now;
    this.updateBlink(now);
    const onGround = this.body.blocked.down || this.body.touching.down;
    // Pisando suelo solo si NO va subiendo. El frame siguiente a un
    // salto `blocked.down` aun viene puesto — el cuerpo todavia solapa
    // el tile — y eso rearmaba el margen de suelo: se despegaba con la
    // pose de pie y tardaba una decima en ponerse la del impulso.
    if (onGround && this.body.velocity.y >= 0) this.lastGroundedAt = now;
    // El suelo, con margen: ver GROUND_GRACE. Todo lo que se ve — la
    // pose, el polvo, los pasos — mira esto y no el `blocked.down` a
    // pelo, que va y viene cada dos frames estando quieta.
    let flying = !onGround && now - this.lastGroundedAt > GROUND_GRACE;

    // Aterrizaje: solo polvo y sonido.
    //
    // Antes aqui habia un aplastado — se ensanchaba y se achataba al
    // tocar suelo. Con los sprites viejos disimulaba; con estos, que ya
    // traen su propia pose de caida dibujada, se leia como si el
    // personaje se arrugara de golpe. El peso lo pone el frame, no una
    // deformacion.
    if (!flying && this.wasAirborne && now - this.lastLandedAt > LANDING_COOLDOWN) {
      this.lastLandedAt = now;
      dust(this.scene, this.x, this.y, 7);
      audio.sfx.land();
      // La pose de cuclillas, y solo aqui: un instante al tocar suelo.
      this.play(this.anim("land"), true);
      this.landingUntil = now + 170;
    }
    this.wasAirborne = flying;

    // Hacia donde mira el cuerpo.
    //
    // Al puntero solo mientras se esta apuntando de verdad — raton
    // moviendose o boton pulsado. Si no, mira hacia donde camina.
    //
    // Antes miraba siempre al raton, y bastaba con andar a la derecha
    // sin tocarlo para pasarse de largo la posicion del cursor: la
    // heroina se giraba hacia atras mientras seguia corriendo hacia
    // delante. El arma sigue apuntando al raton en todos los casos.
    const aim = input.pointerWorld();
    if (!this.locked) {
      const dir = input.moveX;
      if (input.aiming) this.facing = aim.x >= this.x ? 1 : -1;
      else if (dir !== 0) this.facing = dir > 0 ? 1 : -1;
      this.setFlipX(this.facing === -1);
    }

    if (this.locked) {
      this.setVelocityX(0);
      this.updateAnimation(!flying, 0);
      this.syncBody();
      this.updateWeapon(aim);
      return;
    }

    const boost = isCoffeeActive() ? COFFEE.speedMultiplier : 1;
    const dir = input.moveX;
    this.setVelocityX(dir * PLAYER.speed * boost);

    // Salto: vale si toco suelo hace poco (coyote) y si se pulso hace
    // poco (buffer). Las dos ventanas se cruzan y el salto sale.
    const canCoyote = now - this.lastGroundedAt <= PLAYER.coyoteMs;
    if (canCoyote && input.consumeJump(PLAYER.jumpBufferMs)) {
      const jumpBoost = isCoffeeActive() ? COFFEE.jumpMultiplier : 1;
      this.setVelocityY(PLAYER.jumpVelocity * jumpBoost);
      this.lastGroundedAt = -Infinity;
      this.jumpCutUsed = false;
      // Ya esta en el aire para lo que queda de este frame: asi la pose
      // del impulso entra en el mismo instante del salto.
      flying = true;
      audio.sfx.jump();
    }

    // Soltar pronto = salto corto. El recorte se aplica UNA vez por
    // salto: cada frame acabaria anulando el salto entero.
    if (!input.jumpHeld && this.body.velocity.y < 0 && !this.jumpCutUsed) {
      this.setVelocityY(this.body.velocity.y * PLAYER.jumpCutMultiplier);
      this.jumpCutUsed = true;
    }

    // S para bajar por una plataforma atravesable.
    if (input.dropThrough && onGround) this.dropUntil = now + 220;

    this.updateAnimation(!flying, dir);
    // Justo despues de elegir la pose: el cuerpo tiene que corresponder
    // al dibujo que se va a ver, no al del frame anterior.
    this.syncBody();
    this.updateWeapon(aim);
    this.footsteps(!flying, dir, delta);
  }

  /** ¿Debe ignorar ahora las plataformas atravesables? */
  get isDropping(): boolean {
    return this.scene.time.now < this.dropUntil;
  }

  private updateWeapon(aim: { x: number; y: number }): void {
    if (!getState().hasGun) {
      this.weapon.setVisible(false);
      return;
    }
    this.weapon.setVisible(true);
    const hand = this.handPosition();
    this.weapon.aim(hand.x, hand.y, aim.x, aim.y);
  }

  private updateAnimation(onGround: boolean, dir: number): void {
    // El golpe manda mientras dura, en el aire o en el suelo: es la
    // unica pose que no la elige este metodo, y sin protegerla el ciclo
    // de andar la pisaba en el frame siguiente y no se veia nunca.
    if (this.scene.time.now < this.hurtUntil) return;

    // El aterrizaje manda un momento: si no, el ciclo de andar lo pisa
    // en el mismo frame y no llega a verse.
    if (onGround && this.scene.time.now < this.landingUntil) return;

    if (!onGround) {
      this.play(this.anim(this.airPose()), true);
    } else if (dir !== 0) {
      // Andar o correr segun lo DEPRISA que vaya de verdad, no segun
      // cuanto lleve andando.
      //
      // Antes eran medio segundo de ciclo de andar antes de arrancar a
      // correr, y se notaba el retraso: pulsabas y tardaba en lanzarse.
      // Con las teclas siempre va a tope, asi que corre desde el primer
      // frame; el ciclo de andar se queda para cuando una escena
      // guionizada la mueve despacio, que es cuando andar significa
      // algo.
      const speed = Math.abs(this.body.velocity.x);
      const running = speed > PLAYER.speed * 0.6;
      this.play(this.anim(running ? "run" : "walk"), true);
    } else {
      this.play(this.anim("idle"), true);
    }
  }

  /**
   * Que pose toca en el aire, segun lo que sube o baja.
   *
   * Los cortes salen del propio salto: se despega a -640 y la gravedad
   * son 1800, asi que subir dura unos 0,35 s. Con estos numeros se ven
   * los tres momentos — impulso, flotar arriba, caer — y ninguno pasa
   * tan rapido como para no verse.
   */
  private airPose(): "rise" | "air" | "fall" {
    const vy = this.body.velocity.y;
    if (vy < -260) return "rise";
    if (vy > 180) return "fall";
    return "air";
  }

  private footsteps(onGround: boolean, dir: number, delta: number): void {
    if (!onGround || dir === 0) {
      this.stepTimer = 0;
      return;
    }
    this.stepTimer += delta;
    if (this.stepTimer >= 270) {
      this.stepTimer = 0;
      audio.sfx.step();
      dust(this.scene, this.x, this.y, 2);
    }
  }

  /* ── Acciones ────────────────────────────────────────────────────── */

  /** Devuelve false si estaba invulnerable y el golpe no cuenta. */
  takeHit(fromX: number): boolean {
    if (this.isInvulnerable) return false;
    this.invulnerableUntil = this.scene.time.now + PLAYER.invulnerableMs;

    const away = this.x < fromX ? -1 : 1;
    this.setVelocity(away * 230, -300);
    audio.sfx.hurt();
    // Ahora hay frames propios de recibir el golpe: se encoge y sale
    // despedida. Antes solo parpadeaba, y el impacto no se veia.
    this.play(this.anim("hurt"), true);
    this.hurtUntil = this.scene.time.now + 320;
    // El parpadeo lo lleva `tick` mirando el reloj, no un tween.
    //
    // Con un tween se quedaba a medias: el aplastado del aterrizaje
    // llama a killTweensOf, y si tocaba justo mientras parpadeaba la
    // heroina se quedaba translucida para el resto de la partida.
    return true;
  }

  /** Parpadeo de invulnerabilidad, calculado por reloj. */
  private updateBlink(now: number): void {
    if (now >= this.invulnerableUntil) {
      if (this.alpha !== 1) this.setAlpha(1);
      return;
    }
    this.setAlpha(Math.floor(now / 90) % 2 === 0 ? 1 : 0.3);
  }

  /**
   * La deja clavada donde esta, fuera de la fisica.
   *
   * Para las celebraciones y los finales guionizados, donde la escena
   * deja de llamar a `tick` — y sin `tick` no hay `syncBody`, asi que el
   * cuerpo se despega de los pies segun cambian de alto los fotogramas,
   * la gravedad tira de ella y acaba colandose por debajo del mapa. Sin
   * `tick` tampoco corre la red de seguridad que la devolveria arriba.
   *
   * Quitandole la gravedad y el cuerpo del medio no hay nada que la
   * pueda mover: se queda exactamente donde termino de jugar.
   */
  freeze(): void {
    this.locked = true;
    this.setVelocity(0, 0);
    this.setAlpha(1);
    this.body.setAllowGravity(false);
    this.body.moves = false;
    this.play(this.anim("idle"), true);
  }

  respawnAt(x: number, y: number): void {
    this.setPosition(x, y);
    this.setVelocity(0, 0);
    this.setAlpha(1);
    this.invulnerableUntil = this.scene.time.now + 900;
  }

  override destroy(fromScene?: boolean): void {
    this.weapon.destroy();
    super.destroy(fromScene);
  }
}
