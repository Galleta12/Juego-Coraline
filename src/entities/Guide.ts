import Phaser from "phaser";
import { INK } from "@/config/palette";
import { GUIDE } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { dialogue } from "@/ui/text";

/**
 * El guia.
 *
 * Entra flotando, explica y se va. Nunca camina y nunca toca el suelo:
 * es lo unico del juego que no obedece a la fisica, y esa diferencia es
 * la que lo hace leerse como algo que no pertenece del todo a este sitio.
 */
/**
 * Margen que se le deja por arriba, en pixeles.
 *
 * Solo lo justo para que su cabeza no se salga del encuadre. Antes eran
 * 230 — la franja entera del HUD — y eso lo empujaba muy por debajo de
 * la heroina en sitios con poco techo, como el arranque del bosque. Del
 * texto del HUD se encarga el recorte del globo, que va aparte.
 */
const BANNER_BAND = 26;

export class Guide {
  readonly sprite: Phaser.GameObjects.Sprite;

  /**
   * Halo detras del guia.
   *
   * Su arte es una silueta oscura y el juego entero transcurre de noche:
   * sin esto se pierde contra los arboles y la jugadora no ve a quien le
   * esta hablando.
   */
  private readonly halo: Phaser.GameObjects.Arc;

  private bubble: Phaser.GameObjects.Container | null = null;
  private bubbleText: Phaser.GameObjects.Text | null = null;
  private typing: Phaser.Time.TimerEvent | null = null;
  private bobTween: Phaser.Tweens.Tween | null = null;

  /** A quien sigue, si es que sigue a alguien. */
  private following: { x: number; y: number } | null = null;
  // Cerca de la cabeza de la jugadora, no en el techo. Flotando alto su
  // globo se salia por arriba de la pantalla y el texto no se leia.
  // A su altura y a un lado.
  //
  // Flotando por encima se cruzaba con ella y con su propio globo; a la
  // misma altura y a 180 px se lee como alguien que la acompaña.
  private readonly offset = { x: 180, y: -10 };

  /**
   * Solo mientras entra o se va.
   *
   * `enter` y `leave` mueven el sprite con tweens y no admiten que nadie
   * mas lo empuje. Hablar si: el guia tiene que seguir acompañando
   * mientras dice sus lineas, porque si se queda plantado donde entro y
   * la jugadora se aleja, el globo se queda hablando solo al fondo.
   */
  private moving = false;

  /** Donde esta la jugadora, para mirarla. */
  private lookAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
  ) {
    this.registerAnimations();

    this.halo = scene.add
      .circle(x, y - 110, 120, INK.thread, 0.14)
      .setDepth(23)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);

    this.sprite = scene.add
      .sprite(x, y, GUIDE.idle)
      .setOrigin(0.5, 1)
      // Mas alto que la heroina, pero no tanto como para no caber en
      // pantalla junto a ella con su globo encima.
      .setScale(0.68)
      .setDepth(24)
      .setAlpha(0);
    this.sprite.play("guide-fly");

    // El halo respira y sigue al guia sin tener que moverlo a mano.
    scene.tweens.add({
      targets: this.halo,
      scale: 1.14,
      duration: 2300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.followHalo, this);
    // Al cerrarse la escena se suelta todo: si no, los listeners
    // sobreviven al reinicio y siguen tocando objetos ya destruidos.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /**
   * Altura a la que cabe entero y no pisa el HUD.
   *
   * El origen del sprite esta en los pies, asi que su cabeza queda a
   * `displayHeight` por encima. Sin esto, en sitios con poco techo — el
   * arranque del bosque, el pasillo del tunel — el guia entraba flotando
   * por encima del borde de la pantalla y solo se le veian las botas.
   */
  private safeY(y: number): number {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    const top = cam.scrollY + (cam.height - cam.height / zoom) / 2;
    // Debajo de la franja del HUD, y con el cuerpo entero dentro.
    const lowest = top + BANNER_BAND + this.sprite.displayHeight;
    return Math.max(y, lowest);
  }

  private followHalo(): void {
    this.halo.setPosition(this.sprite.x, this.sprite.y - this.sprite.displayHeight * 0.45);
    this.halo.setAlpha(this.sprite.alpha * 0.9);
  }

  /**
   * Que acompañe a la jugadora por el nivel.
   *
   * Flota detras con retraso, como algo que va a su aire pero no se
   * despega. Antes solo aparecia para hablar y desaparecia: por el
   * camino se estaba sola, y el guia es el hilo que sostiene el juego.
   *
   * El lado se elige por donde este ella dentro del mundo, para que
   * nunca se quede flotando fuera de la pantalla.
   */
  follow(x: number, y: number, worldWidth: number): void {
    if (this.moving) return;
    this.lookAt = x;
    const side = x > worldWidth * 0.6 ? -1 : 1;
    this.following = { x: x + this.offset.x * side, y: y + this.offset.y };

    // Si acabo de irse volando, vuelve a aparecer junto a ella en vez de
    // materializarse de la nada.
    if (this.sprite.alpha < 0.05) {
      this.sprite.setPosition(this.following.x, this.following.y);
      this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 700 });
      this.sprite.play("guide-fly");
    }
  }

  stopFollowing(): void {
    this.following = null;
  }

  /** Se llama cada frame desde la escena. */
  tick(delta: number): void {
    if (this.moving || !this.following || this.sprite.alpha < 0.05) return;

    // Sigue con retraso: nunca llega a pegarse, y eso es lo que le da
    // ese aire de ir a su ritmo.
    const k = Math.min(1, (delta / 1000) * 2.4);
    this.sprite.x += (this.following.x - this.sprite.x) * k;
    this.sprite.y += (this.following.y - this.sprite.y) * k;

    this.sprite.y = this.safeY(this.sprite.y);

    // Y siempre la mira a ella, este donde este.
    //
    // El arte lo tiene mirando a la izquierda, asi que se voltea cuando
    // la jugadora queda a su derecha. Antes se orientaba segun su propio
    // destino y acababa hablandole a la pared.
    this.sprite.setFlipX(this.lookAt > this.sprite.x);
  }

  private registerAnimations(): void {
    const a = this.scene.anims;
    const make = (key: string, keys: string[], rate: number) => {
      if (a.exists(key)) return;
      a.create({
        key,
        frames: keys.map((k) => ({ key: k })),
        frameRate: rate,
        repeat: -1,
      });
    };
    make("guide-fly", [GUIDE.fly1, GUIDE.fly2], 3);
    make("guide-talk", [GUIDE.talk1, GUIDE.talk2], 6);
    make("guide-idle", [GUIDE.idle], 1);
    make("guide-point", [GUIDE.point], 1);
  }

  /** Entra flotando desde arriba. */
  async enter(x: number, y: number): Promise<void> {
    this.moving = true;
    const target = this.safeY(y);
    this.sprite.setPosition(x, target - 140).setAlpha(0);
    this.sprite.play("guide-fly");

    await new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: this.sprite,
        y: target,
        alpha: 1,
        duration: 900,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.moving = false;
          resolve();
        },
      });
    });

    // Flotacion continua: nunca esta del todo quieto.
    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: target - 10,
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /** Se va flotando hacia arriba. */
  async leave(): Promise<void> {
    this.hideBubble();
    this.moving = true;
    this.following = null;
    this.bobTween?.remove();
    this.bobTween = null;
    await new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: this.sprite,
        y: this.sprite.y - 170,
        alpha: 0,
        duration: 900,
        ease: "Sine.easeIn",
        onComplete: () => {
          this.moving = false;
          resolve();
        },
      });
    });
  }

  point(): void {
    this.sprite.play("guide-point");
  }

  /**
   * Dice una linea. Se escribe letra a letra y se queda el tiempo justo
   * para leerla; con clic o espacio se adelanta.
   */
  say(line: string, holdMs?: number): Promise<void> {
    // Linea vacia = linea recortada del guion. Al acortar el tutorial
    // muchas frases se dejaron en blanco en vez de borrar la llamada,
    // y sin esto salia una burbuja vacia por cada una.
    if (!line.trim()) return Promise.resolve();

    this.showBubble();
    this.sprite.play("guide-talk");

    const target = this.bubbleText;
    if (!target) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.typing?.remove();
        this.typing = null;
        target.setText(line);
        this.sprite.play("guide-fly");
        const hold = holdMs ?? Math.max(900, Math.min(3200, line.length * 46));
        this.scene.time.delayedCall(hold, resolve);
      };

      let i = 0;
      target.setText("");
      this.typing = this.scene.time.addEvent({
        delay: 26,
        repeat: line.length - 1,
        callback: () => {
          i++;
          target.setText(line.slice(0, i));
          if (i % 3 === 0) audio.sfx.typewriter();
          if (i >= line.length) finish();
        },
      });
    });
  }

  /** Varias lineas seguidas. */
  async monologue(lines: readonly string[]): Promise<void> {
    for (const line of lines) await this.say(line);
    this.hideBubble();
  }

  private showBubble(): void {
    if (this.bubble) return;

    const c = this.scene.add.container(0, 0).setDepth(30);
    const bg = this.scene.add.graphics();
    const text = this.scene.add.text(0, 0, "", dialogue(19)).setOrigin(0, 0);

    c.add([bg, text]);
    this.bubble = c;
    this.bubbleText = text;

    // El globo se redibuja cada frame porque el guia flota.
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.layoutBubble, this);
    this.layoutBubble();
  }

  private layoutBubble(): void {
    const c = this.bubble;
    const t = this.bubbleText;
    if (!c || !t) return;

    // El contenedor puede estar ya destruido.
    //
    // Al morir, la escena se reinicia y Phaser destruye sus objetos,
    // pero las referencias de aqui siguen apuntando a ellos. Sin esta
    // guarda, el siguiente frame intentaba redibujar un globo que ya no
    // existia y reventaba la partida entera.
    if (!c.scene || !c.active) {
      this.hideBubble();
      return;
    }

    const bg = c.getAt(0) as Phaser.GameObjects.Graphics | null;
    if (!bg) {
      this.hideBubble();
      return;
    }

    const padX = 16;
    const padY = 12;
    const w = Math.max(120, t.width + padX * 2);
    const h = t.height + padY * 2;

    // Se coloca al lado del guia y a la altura de su cara. Sobre el
    // sombrero quedaba tan arriba que costaba relacionar el texto con
    // quien lo dice, ahora que el guia es alto.
    // El globo se recorta SIEMPRE contra la camara.
    //
    // Antes se colocaba solo respecto al sprite, y en cuanto el guia
    // flotaba cerca del borde — arriba del pozo, en el tunel, en la sala
    // de las puertas — el texto se salia de la pantalla y no se leia
    // nada. Ahora se coloca donde puede y luego se mete dentro a la
    // fuerza: siempre visible, aunque quede un poco separado de el.
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    const viewW = cam.width / zoom;
    const viewH = cam.height / zoom;
    const left = cam.scrollX + (cam.width - viewW) / 2;
    const top = cam.scrollY + (cam.height - viewH) / 2;
    const margin = 14;
    // Franja de arriba reservada al HUD.
    //
    // Ahi vive el objetivo del nivel ("Baja a por la llave") y el globo
    // se le colaba encima: las dos lineas caian una sobre otra y no se
    // leia ninguna. Va en pixeles de PANTALLA convertidos a mundo,
    // porque el HUD no se aleja con el zoom y el globo si.
    const hudBand = 88 / zoom;

    // El globo sale por el lado CONTRARIO a la jugadora.
    //
    // Hacia ella quedaba pegado a su cabeza y se solapaban los dos. Al
    // otro lado hay sitio libre y se lee sin estorbar, y la cola visual
    // sigue siendo el guia, que esta justo al lado.
    let x = this.lookAt > this.sprite.x ? this.sprite.x - 44 - w : this.sprite.x + 44;
    // Si por ese lado no cabe, se prueba el otro antes de recortar.
    if (x + w > left + viewW - margin || x < left + margin) {
      x = this.lookAt > this.sprite.x ? this.sprite.x + 44 : this.sprite.x - 44 - w;
    }
    let y = this.sprite.y - this.sprite.displayHeight * 0.72 - h / 2;

    x = Phaser.Math.Clamp(x, left + margin, left + viewW - w - margin);
    y = Phaser.Math.Clamp(y, top + hudBand, top + viewH - h - margin);

    c.setPosition(x, y);
    t.setPosition(padX, padY);

    bg.clear();
    bg.fillStyle(INK.void, 0.9);
    bg.fillRoundedRect(0, 0, w, h, 4);
    bg.lineStyle(1.5, INK.thread, 0.9);
    bg.strokeRoundedRect(0, 0, w, h, 4);
    // Puntadas en el borde superior: el motivo del juego.
    bg.lineStyle(1.5, INK.thread, 0.5);
    for (let sx = 8; sx < w - 8; sx += 11) bg.lineBetween(sx, 0, sx + 5, 0);
  }

  hideBubble(): void {
    this.typing?.remove();
    this.typing = null;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.layoutBubble, this);
    this.bubble?.destroy();
    this.bubble = null;
    this.bubbleText = null;
  }

  destroy(): void {
    this.hideBubble();
    this.bobTween?.remove();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.followHalo, this);
    this.halo.destroy();
    this.sprite.destroy();
  }
}
