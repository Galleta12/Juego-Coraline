import Phaser from "phaser";
import { CAT } from "@/config/game";
import { INK } from "@/config/palette";
import { CAT_ART } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { GLOW_TEX, buildGlow } from "@/ui/Atmosphere";
import { dust } from "@/ui/Effects";
import { label } from "@/ui/text";

/**
 * Luna.
 *
 * Sigue a la jugadora con retraso, salta cuando ella salta y ataca —
 * solo a los aldeanos, y solo si hay uno cerca. Si aparece un creeper
 * se espanta: eso mantiene el susto del creeper intacto, porque el gato
 * no lo va a resolver.
 *
 * Es invulnerable y no bloquea el paso. Un companero que estorbe o que
 * haya que proteger deja de ser companero.
 */
const CAT_SCALE = 0.62;

/**
 * Aire que el pack deja bajo las patas, en pixeles de textura.
 *
 * Ahora CERO, y medido: el pipeline recorta el grupo de poses por su
 * linea de suelo comun, asi que el dibujo llega hasta la ultima fila del
 * lienzo en las ocho poses.
 *
 * Antes eran siete, porque las poses del salto y del zarpazo se apoyaban
 * en el borde del lienzo y ensanchaban la caja del grupo por abajo. Ese
 * mismo fallo le cortaba las patas a Luna al saltar. Si algun dia vuelve
 * a haber hueco, se mide y se pone aqui: con un numero de menos flota, y
 * con uno de mas se entierra.
 */
const AIR_BELOW = 0;

/**
 * Cuanto se hunde ademas, para que el contorno oscuro del dibujo se
 * solape con el borde del tile en vez de leerse como una rendija.
 */
const FOOT_SINK = 2;

/**
 * Luz de luna que la acompana.
 *
 * Es una gata gris oscura sobre fondos morados oscuros: sin esto se
 * pierde en el decorado y la jugadora no llega a enterarse de que tiene
 * companera. El halo no la ilumina de adorno, la hace legible — y el
 * tono frio viene de su nombre.
 */
const MOON = 0xa8c8f0;

export class Cat extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  /** Publico solo para que el QA pueda apagarlo y comparar. */
  readonly glow: Phaser.GameObjects.Image;

  private lastAttackAt = -Infinity;
  private attacking = false;
  private scared = false;
  /** Enfriamiento del salto: sin el, saltaba en cada frame. */
  private nextJumpAt = 0;
  /** Enfriamiento del reenganche, para que no parpadee. */
  private nextWarpAt = 0;
  private lastGroundedAt = -Infinity;

  /**
   * No salta durante los primeros segundos.
   *
   * Al arrancar un nivel la camara esta guionizada y la jugadora
   * bloqueada; la gata, en cambio, ya estaba corrigiendo su posicion y
   * se pasaba la introduccion entera dando botes.
   */
  private calmUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, CAT_ART.idle);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 1).setScale(CAT_SCALE).setDepth(18);

    // El cuerpo termina en las patas, no en el borde del lienzo.
    //
    // El fondo del cuerpo tiene que caer justo donde acaba el dibujo:
    // `alto - aire - alto del cuerpo`. Cualquier otra cosa deja a la
    // gata flotando o medio enterrada.
    const bw = 60;
    const bh = 58;
    this.body.setSize(bw, bh);
    this.body.setOffset(
      (this.width - bw) / 2,
      this.height - AIR_BELOW - bh - FOOT_SINK,
    );
    // No empuja ni frena a nadie: solo choca con el terreno.
    this.body.setCollideWorldBounds(true);

    this.calmUntil = scene.time.now + 4000;

    // Por DEBAJO de ella, para que la recorte del fondo sin lavarle el
    // dibujo. Late despacio: una luz fija se lee como un adorno pegado.
    buildGlow(scene);
    this.glow = scene.add
      .image(x, y, GLOW_TEX)
      .setDisplaySize(168, 120)
      .setTint(MOON)
      .setAlpha(0.22)
      .setDepth(this.depth - 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: this.glow,
      alpha: 0.34,
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.registerAnimations();
    this.play("cat-idle");

    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "cat-attack", () => {
      this.attacking = false;
    });
  }

  private registerAnimations(): void {
    const a = this.scene.anims;
    const make = (key: string, keys: string[], rate: number, repeat: number) => {
      if (a.exists(key)) return;
      a.create({ key, frames: keys.map((k) => ({ key: k })), frameRate: rate, repeat });
    };
    make("cat-idle", [CAT_ART.idle], 1, -1);
    make("cat-walk", [CAT_ART.walk1, CAT_ART.walk2, CAT_ART.walk3], 7, -1);
    make("cat-jump", [CAT_ART.jump], 1, 0);
    make("cat-fall", [CAT_ART.fall], 1, 0);
    make("cat-alert", [CAT_ART.alert], 1, -1);
    make("cat-attack", [CAT_ART.attack, CAT_ART.alert], 8, 0);
  }

  /**
   * Que se note que Luna acaba de llegar.
   *
   * Aparecia sin mas, detras de la jugadora y del color del decorado:
   * el guia decia "Luna te acompana" y no habia forma de saber a que se
   * referia. Ahora llega con su nombre encima, un maullido, polvo a las
   * patas y unas motas de luz que suben, y el halo se enciende de golpe.
   *
   * Solo la entrada. El halo se queda para siempre, que es lo que hace
   * que se la siga viendo el resto de la partida.
   */
  arrive(): void {
    audio.sfx.catMeow();
    dust(this.scene, this.x, this.y, 8);

    // Golpe de luz al aparecer, y de ahi a su brillo de siempre.
    this.scene.tweens.killTweensOf(this.glow);
    this.glow.setAlpha(0.85);
    this.scene.tweens.add({
      targets: this.glow,
      alpha: 0.26,
      duration: 900,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.glow,
          alpha: 0.34,
          duration: 1900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      },
    });

    // Motas de luz subiendo desde ella.
    for (let i = 0; i < 14; i++) {
      const p = this.scene.add
        .circle(
          this.x + (Math.random() - 0.5) * 46,
          this.y - Math.random() * 30,
          1 + Math.random() * 2.4,
          MOON,
          0.9,
        )
        .setDepth(this.depth + 1)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: p,
        y: p.y - 50 - Math.random() * 70,
        x: p.x + (Math.random() - 0.5) * 40,
        alpha: 0,
        scale: 0.3,
        duration: 900 + Math.random() * 700,
        onComplete: () => p.destroy(),
      });
    }

    // Su nombre, un momento y encima de ella.
    const tag = this.scene.add
      .text(this.x, this.y - this.displayHeight - 10, "LUNA", label(14, INK.bone))
      .setOrigin(0.5, 1)
      .setDepth(this.depth + 2)
      .setAlpha(0);
    tag.setLetterSpacing(4);
    tag.setShadow(0, 2, "#0a0710", 6, false, true);

    this.scene.tweens.add({
      targets: tag,
      alpha: 1,
      y: tag.y - 12,
      duration: 420,
      ease: "Back.easeOut",
      hold: 1900,
      yoyo: true,
      onComplete: () => tag.destroy(),
    });
  }

  get isScared(): boolean {
    return this.scared;
  }

  /**
   * @param target       a quien sigue
   * @param villagers    posibles victimas de su zarpazo
   * @param creepers     lo unico que le da miedo
   * @param onClaw       se llama cuando alcanza a un aldeano
   */
  tick(
    target: Phaser.Physics.Arcade.Sprite,
    villagers: Phaser.Physics.Arcade.Sprite[],
    creepers: Phaser.Physics.Arcade.Sprite[],
    onClaw: (victim: Phaser.Physics.Arcade.Sprite) => void,
  ): void {
    const now = this.scene.time.now;
    const onGround = this.body.blocked.down || this.body.touching.down;
    if (onGround) this.lastGroundedAt = now;

    // El halo va con ella, tambien en las ramas que salen antes.
    this.glow.setPosition(this.x, this.y - this.displayHeight * 0.42);

    // Igual que la heroina: `blocked.down` parpadea estando quieta, y
    // sin margen la gata alternaba entre la pose de estar de pie y la de
    // salto sin moverse del sitio.
    const flying = !onGround && now - this.lastGroundedAt > 120;

    // Un creeper cerca lo cambia todo: deja de perseguir y se aparta.
    const creeper = nearest(this, creepers, CAT.scaredRange);
    this.scared = creeper !== null;

    if (this.scared && creeper) {
      const away = this.x < creeper.x ? -1 : 1;
      this.setVelocityX(away * CAT.speed * 0.85);
      this.setFlipX(away === -1);
      if (!this.attacking) this.play("cat-alert", true);
      if (onGround && Math.abs(this.x - creeper.x) < 120) {
        this.setVelocityY(-520);
        audio.sfx.catHiss();
      }
      return;
    }

    // Aldeano al alcance: zarpazo, con enfriamiento.
    const prey = nearest(this, villagers, CAT.attackRange);
    if (prey && now - this.lastAttackAt > CAT.attackCooldownMs) {
      this.lastAttackAt = now;
      this.attacking = true;
      this.setFlipX(prey.x < this.x);
      this.play("cat-attack", true);
      audio.sfx.catHiss();
      this.scene.time.delayedCall(140, () => {
        if (prey.active) onClaw(prey);
      });
      return;
    }

    // Si no, seguir a la jugadora manteniendo distancia.
    const dx = target.x - this.x;
    const gap = Math.abs(dx);

    if (gap > CAT.followGap) {
      const dir = Math.sign(dx);
      const urgency = Math.min(1, (gap - CAT.followGap) / 220);
      this.setVelocityX(dir * CAT.speed * (0.45 + urgency * 0.55));
      this.setFlipX(dir === -1);
    } else {
      this.setVelocityX(this.body.velocity.x * 0.8);
    }

    // Salta si la jugadora esta bastante mas arriba, o si topa con algo.
    //
    // Con enfriamiento y con un umbral alto: sin ellos rebotaba sin
    // parar porque la jugadora casi siempre esta unos pixeles por encima
    // y la condicion se cumplia en todos los frames.
    const wantsUp = target.y < this.y - 120;
    const blocked = this.body.blocked.left || this.body.blocked.right;
    if (
      onGround &&
      now > this.calmUntil &&
      now > this.nextJumpAt &&
      (wantsUp || (blocked && gap > CAT.followGap))
    ) {
      this.setVelocityY(-680);
      this.nextJumpAt = now + 700;
    }

    // Si se queda muy atras, teletransporte discreto: perder al gato de
    // vista rompe mas la ilusion que verlo reaparecer.
    //
    // Tambien cuenta la altura. En el pozo del bosque la jugadora baja
    // veinte metros de golpe y el gato se quedaba arriba: la distancia
    // horizontal era minima y nunca se disparaba el reenganche.
    const drop = Math.abs(target.y - this.y);
    if (now > this.nextWarpAt && (gap > 700 || drop > 420)) {
      // Con un salto seco parpadeaba.
      //
      // El umbral de altura estaba en 220, y en salas altas — la
      // guarida tiene doce filas de cielo — cualquier salto a una
      // repisa lo superaba: la gata se reenganchaba una y otra vez y se
      // veia como un parpadeo. Ahora hay que quedarse MUY atras, hay
      // enfriamiento entre reenganches, y ademas se hace con un
      // fundido para que no salte a la vista.
      this.nextWarpAt = now + 1200;
      this.scene.tweens.killTweensOf(this);
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: 130,
        onComplete: () => {
          this.setPosition(target.x - 60, target.y - 40);
          this.setVelocity(0, 0);
          this.scene.tweens.add({ targets: this, alpha: 1, duration: 200 });
        },
      });
    }

    if (this.attacking) return;
    if (flying) {
      this.play(this.body.velocity.y < 0 ? "cat-jump" : "cat-fall", true);
    } else if (Math.abs(this.body.velocity.x) > 20) {
      this.play("cat-walk", true);
    } else {
      this.play("cat-idle", true);
    }
  }

  override destroy(fromScene?: boolean): void {
    this.scene?.tweens.killTweensOf(this.glow);
    this.glow.destroy();
    super.destroy(fromScene);
  }
}

function nearest(
  from: Phaser.GameObjects.Sprite,
  list: Phaser.Physics.Arcade.Sprite[],
  range: number,
): Phaser.Physics.Arcade.Sprite | null {
  let best: Phaser.Physics.Arcade.Sprite | null = null;
  let bestDist = range;
  for (const s of list) {
    if (!s.active) continue;
    const d = Phaser.Math.Distance.Between(from.x, from.y, s.x, s.y);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}
