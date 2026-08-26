import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, SAFE } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { spark } from "@/ui/Screens";

/**
 * "Buenas elecciones — Gertrudis acepta".
 *
 * La lamina de remate entre decir que si y el calendario. Es una sola
 * imagen, asi que aqui todo el trabajo esta en que no se lea como una
 * pantalla de carga: entra con un golpe de luz, respira, le suben
 * motas doradas y suelta destellos sobre los tres perros.
 *
 * La cancion sigue sonando por debajo sin cortarse.
 */
export class GertrudisScene extends Phaser.Scene {
  constructor() {
    super(S.Gertrudis);
  }

  preload(): void {
    queue(this, ["screens/gertrudis"]);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(INK.void);
    this.cameras.main.fadeIn(600, 8, 6, 14);
    void audio.playMusic("finale");

    // Entera y con margen, NO cubriendo la pantalla.
    //
    // La lamina es mas cuadrada que el lienzo (1535x1012 contra 16:9), y
    // encima el juego va en modo ENVELOP: `fitCover` la escalaba por el
    // ancho y luego el propio lienzo recortaba hasta SAFE px mas por
    // arriba, asi que el titulo ("BUENAS ELECCIONES / GERTRUDIS ACEPTA"),
    // que vive pegado al borde superior del dibujo, se perdia. Aqui es
    // todo texto: tiene que caber entero o no se entiende la lamina.
    //
    // Mismo criterio que las laminas del remate y que `showCard`: fit
    // inside contra el area segura, no contra la pantalla completa.
    const art = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "screens/gertrudis");
    const safeW = GAME_WIDTH - SAFE * 2;
    const safeH = GAME_HEIGHT - SAFE * 2;
    const base = Math.min(safeW / art.width, safeH / art.height);
    const bg = art.setScale(base).setDepth(0).setAlpha(0);

    // Entra creciendo, como un cartel que se planta delante.
    bg.setScale(base * 0.94);
    this.tweens.add({
      targets: bg,
      alpha: 1,
      scale: base,
      duration: 620,
      ease: "Back.easeOut",
    });
    // Y sigue acercandose despacio mientras esta en pantalla. Muy poco:
    // el ajuste ya deja la lamina justo dentro del margen seguro, asi
    // que un acercamiento mayor volveria a comerse el titulo.
    this.tweens.add({
      targets: bg,
      scale: base * 1.02,
      duration: 3600,
      delay: 620,
      ease: "Sine.easeInOut",
    });

    audio.sfx.uiConfirm();
    this.cameras.main.flash(400, 255, 220, 160);

    // Latido calido sobre la lamina.
    const glow = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffc46a, 0.05)
      .setOrigin(0)
      .setDepth(2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: glow,
      fillAlpha: 0.14,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Motas doradas subiendo.
    this.time.addEvent({
      delay: 130,
      loop: true,
      callback: () => {
        const x = Math.random() * GAME_WIDTH;
        const p = this.add
          .circle(x, GAME_HEIGHT + 10, 1.6 + Math.random() * 3.4, 0xffd98a, 0.6)
          .setDepth(3)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: p,
          y: -20,
          x: x + (Math.random() - 0.5) * 160,
          alpha: 0,
          duration: 3400 + Math.random() * 2600,
          onComplete: () => p.destroy(),
        });
      },
    });

    // Chispas sobre el cartel, en tandas, como confeti de tela.
    for (const [at, x] of [
      [520, 0.28],
      [900, 0.5],
      [1280, 0.72],
    ] as const) {
      this.time.delayedCall(at, () =>
        spark(this, GAME_WIDTH * x, GAME_HEIGHT * 0.3, 0xffe2a0, 16),
      );
    }

    // Y al calendario.
    this.time.delayedCall(4200, () => {
      this.cameras.main.fadeOut(700, 8, 6, 14);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start(S.Schedule);
      });
    });
  }
}
