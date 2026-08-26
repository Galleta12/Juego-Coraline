import Phaser from "phaser";
import { cutTo } from "@/ui/Transition";
import { reportProgress } from "@/systems/Api";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { NAME_SCREEN } from "@/config/strings";
import { queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { setState } from "@/systems/GameState";
import { buildVignette } from "@/ui/Grade";
import { fontsReady, label, shadow, title } from "@/ui/text";

/**
 * Pon tu nombre para empezar.
 *
 * Es lo primero de todo, antes incluso del cuaderno. El juego es un
 * regalo para una persona concreta, asi que solo acepta su nombre: con
 * cualquier otro contesta que no es para ti y no deja pasar.
 *
 * No es un muro de seguridad — se salta mirando el codigo en dos
 * minutos — es parte de la broma.
 */

/** A quien va dirigido esto. Se compara sin tildes ni mayusculas. */
const ALLOWED = ["angie", "vio", "violeta"];

const MAX_LEN = 14;

export class NameScene extends Phaser.Scene {
  private typed = "";
  private field!: Phaser.GameObjects.Text;
  private caret!: Phaser.GameObjects.Rectangle;
  private deny: Phaser.GameObjects.Text | null = null;
  private done = false;

  constructor() {
    super(S.Name);
  }

  preload(): void {
    queue(this, ["screens/name-bg"]);
  }

  async create(): Promise<void> {
    this.typed = "";
    this.done = false;
    this.deny = null;

    this.cameras.main.setBackgroundColor(INK.void);
    this.cameras.main.fadeIn(700, 8, 6, 14);
    void audio.playMusic("intro");

    // La lamina nueva ya viene apaisada y en grande, asi que cubre la
    // pantalla casi sin recortar.
    const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "screens/name-bg");
    const k = Math.max(GAME_WIDTH / bg.width, GAME_HEIGHT / bg.height);
    bg.setScale(k).setDepth(0);

    buildVignette(this);
    this.ambience();
    await fontsReady();

    // Donde cae el recuadro DIBUJADO en la lamina, medido sobre ella y
    // no sobre la pantalla: al cubrir se recorta un poco, y una
    // fraccion de la pantalla no caeria en el mismo sitio.
    const FIELD_FRAC = 0.795;
    const fieldY = bg.y + (FIELD_FRAC - 0.5) * bg.displayHeight;

    this.field = this.add
      .text(GAME_WIDTH / 2, fieldY, "", title(30, INK.bone))
      .setOrigin(0.5)
      .setDepth(6);
    this.field.setLetterSpacing(4);

    this.caret = this.add
      .rectangle(GAME_WIDTH / 2, fieldY, 2, 30, INK.bone)
      .setDepth(6);
    this.tweens.add({
      targets: this.caret,
      alpha: 0,
      duration: 520,
      yoyo: true,
      repeat: -1,
    });

    // Por debajo del recuadro, no encima: ahi tapaba el titulo.
    const hint = this.add
      .text(GAME_WIDTH / 2, fieldY + 54, NAME_SCREEN.hint, label(13, INK.boneDim))
      .setOrigin(0.5)
      .setDepth(6);
    hint.setLetterSpacing(2);

    // Se quita cualquier escucha anterior antes de poner el nuevo.
    //
    // Red de seguridad: si por lo que sea esta escena llega a montarse
    // dos veces sin apagarse en medio, quedarian dos escuchas y cada
    // letra se escribiria repetida. Empezando por borrar, montarla mil
    // veces da igual — siempre queda uno.
    this.input.keyboard?.removeAllListeners(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN);
    this.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, (e: KeyboardEvent) =>
      this.onKey(e),
    );
    // Sin gesto previo el navegador no deja crear el contexto de audio,
    // y esta es la primera pantalla del juego.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => audio.unlock());
  }

  /**
   * Vida para la primera pantalla.
   *
   * Es lo primero que se ve del juego y era una foto quieta. Ahora
   * llueve, las farolas de la lamina laten y flotan motas: nada que
   * distraiga del recuadro, pero el sitio parece un sitio y no una
   * portada.
   */
  private ambience(): void {
    // Lluvia fina en diagonal, delante del fondo.
    for (let i = 0; i < 54; i++) {
      const drop = this.add
        .rectangle(
          Math.random() * GAME_WIDTH,
          Math.random() * GAME_HEIGHT,
          1.4,
          10 + Math.random() * 12,
          0xbcd0e4,
          0.22 + Math.random() * 0.2,
        )
        .setDepth(2)
        .setAngle(11);

      const fall = () => {
        drop.setPosition(Math.random() * (GAME_WIDTH + 120) - 60, -30);
        this.tweens.add({
          targets: drop,
          y: GAME_HEIGHT + 30,
          x: drop.x + 60,
          duration: 900 + Math.random() * 700,
          onComplete: fall,
        });
      };
      this.time.delayedCall(Math.random() * 1600, fall);
    }

    // Latido caliente sobre la escena, como el temblor de las farolas.
    const glow = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffb35c, 0.04)
      .setOrigin(0)
      .setDepth(3)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: glow,
      fillAlpha: 0.1,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Y motas subiendo, para que el aire tenga cuerpo.
    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        const x = Math.random() * GAME_WIDTH;
        const p = this.add
          .circle(x, GAME_HEIGHT + 10, 1 + Math.random() * 2.2, 0xffd9a0, 0.45)
          .setDepth(4)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: p,
          y: -20,
          x: x + (Math.random() - 0.5) * 120,
          alpha: 0,
          duration: 6000 + Math.random() * 4000,
          onComplete: () => p.destroy(),
        });
      },
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.done) return;
    audio.unlock();

    if (e.key === "Enter") {
      this.submit();
      return;
    }
    if (e.key === "Backspace") {
      this.typed = this.typed.slice(0, -1);
      this.redraw();
      return;
    }
    // Solo letras y espacio: numeros y simbolos no pintan nada en un
    // nombre y solo dan ocasion de escribir tonterias.
    if (e.key.length === 1 && /[\p{L} ]/u.test(e.key) && this.typed.length < MAX_LEN) {
      this.typed += e.key;
      audio.sfx.typewriter();
      this.redraw();
    }
  }

  private redraw(): void {
    this.field.setText(this.typed.toUpperCase());
    this.caret.x = GAME_WIDTH / 2 + this.field.width / 2 + 8;
    this.deny?.destroy();
    this.deny = null;
  }

  /** Sin tildes, sin mayusculas y sin espacios de mas. */
  private normalized(): string {
    return this.typed
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  private submit(): void {
    if (!this.typed.trim()) return;

    if (!ALLOWED.includes(this.normalized())) {
      this.reject();
      return;
    }

    this.done = true;
    audio.sfx.uiConfirm();
    setState({ playerName: this.typed.trim() });

    // El aviso sale DESPUES de guardar el nombre, para que el correo lo
    // lleve. Sin `await`: si la red va lenta, el juego no la espera.
    void reportProgress("name");

    cutTo(this, S.Storybook, { fadeMs: 620 });
  }

  private reject(): void {
    audio.sfx.uiDeny();
    this.cameras.main.shake(220, 0.008);

    // ARRIBA, no debajo del campo.
    //
    // Antes salia justo bajo el recuadro y se montaba encima del nombre
    // que se acababa de escribir: las dos cosas ocupaban la misma
    // franja y no se leia ninguna.
    this.deny?.destroy();
    this.deny = shadow(
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT * 0.16,
          NAME_SCREEN.notForYou,
          title(26, INK.blood),
        )
        .setOrigin(0.5)
        .setDepth(7),
    );
    this.deny.setAlpha(0).setScale(0.9);
    this.tweens.add({
      targets: this.deny,
      alpha: 1,
      scale: 1,
      duration: 300,
      ease: "Back.easeOut",
    });
  }
}
