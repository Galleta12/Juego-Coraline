import Phaser from "phaser";
import { reportOpen } from "@/systems/Api";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { INK, css } from "@/config/palette";
import { S } from "@/config/scenes";
import { queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { buildVignette } from "@/ui/Grade";
import { fontsReady, label, shadow, title } from "@/ui/text";

/**
 * Arranque.
 *
 * Carga solo la lamina de la pantalla siguiente. Cada escena carga
 * despues su propio arte: el pack entero son mas de 130 texturas y no
 * tiene sentido bloquear el arranque esperando a los fondos del boss.
 *
 * Tambien espera un gesto de la jugadora, que no es decorativo: sin el,
 * el navegador no deja crear el contexto de audio.
 */
export class BootScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Rectangle;
  private track!: Phaser.GameObjects.Rectangle;
  private pct!: Phaser.GameObjects.Text;
  private eyebrow!: Phaser.GameObjects.Text;

  constructor() {
    super(S.Boot);
  }

  preload(): void {
    this.buildLoadingUI();

    // La lamina de la primera pantalla, que es lo siguiente que se ve.
    //
    // Antes se pedian aqui las poses de reposo de las heroinas, con una
    // clave (`idle`) que ya no existe en el manifiesto: la barra de
    // carga no esperaba a nada. El personaje lo carga cada nivel.
    queue(this, ["screens/name-bg"]);

    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => {
      this.bar.setScale(v, 1);
      this.pct.setText(`${Math.round(v * 100)}%`);
    });
  }

  private buildLoadingUI(): void {
    this.cameras.main.setBackgroundColor(INK.void);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.eyebrow = shadow(
      this.add
        .text(cx, cy - 60, "AUTORIDAD MINERA", label(14, INK.thread))
        .setOrigin(0.5),
    );
    this.eyebrow.setLetterSpacing(6);

    const w = 320;
    this.track = this.add.rectangle(cx, cy, w, 4, INK.bruise).setOrigin(0.5);
    this.bar = this.add
      .rectangle(cx - w / 2, cy, w, 4, INK.thread)
      .setOrigin(0, 0.5);
    this.bar.setScale(0, 1);

    this.pct = this.add
      .text(cx, cy + 26, "0%", label(13, INK.boneDim))
      .setOrigin(0.5);
  }

  async create(): Promise<void> {
    buildVignette(this);
    await fontsReady();

    // Se va toda la interfaz de carga: dejar la barra de fondo puesta
    // ensucia el texto que viene justo encima.
    this.pct.destroy();
    this.bar.destroy();
    this.track.destroy();
    this.eyebrow.destroy();

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const prompt = shadow(
      this.add
        .text(cx, cy, "Pulsa cualquier tecla para empezar", title(30, INK.bone))
        .setOrigin(0.5),
    );
    const hint = this.add
      .text(cx, cy + 44, "Se juega con teclado y ratón", label(14, INK.boneDim))
      .setOrigin(0.5);

    // El aviso de la pantalla completa, aparte y en dorado.
    //
    // Va en su propia linea y con color propio a proposito: es una
    // instruccion que hay que seguir ANTES de empezar, no un dato mas
    // sobre el juego, y mezclado con la linea de arriba se leia como
    // parte de la misma frase y se pasaba por alto.
    const full = this.add
      .text(cx, cy + 76, "Pon el navegador en pantalla completa", label(14, INK.gold))
      .setOrigin(0.5);
    full.setLetterSpacing(1);
    this.tweens.add({
      targets: full,
      alpha: 0.55,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.tweens.add({
      targets: prompt,
      alpha: 0.35,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Arranca UNA vez, venga por donde venga.
    //
    // Hay dos formas de empezar — una tecla o un clic — y cada una tenia
    // su propio `once`. `once` garantiza que ESE escucha no se repite,
    // pero no que no salten los dos: pulsar una tecla despues de hacer
    // clic en la pagina (lo normal, para darle el foco) disparaba los
    // dos, y cada uno encolaba su propio "cuando acabe el fundido, entra
    // a la pantalla del nombre".
    //
    // El fundido acaba una sola vez, pero llamaba a los dos: la escena
    // del nombre se creaba DOS veces, con lo que quedaban dos escuchas
    // de teclado vivos y cada letra se escribia repetida.
    let started = false;
    const start = () => {
      if (started) return;
      started = true;

      audio.unlock();
      audio.sfx.uiConfirm();
      this.notifyOpen();
      this.cameras.main.fadeOut(420, 8, 6, 14);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        prompt.destroy();
        hint.destroy();
        full.destroy();
        this.scene.start(S.Name);
      });
    };

    this.input.keyboard?.once(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, start);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, start);
  }

  /**
   * Avisa al propietario de que alguien abrio el juego. Una vez por
   * sesion, nunca en cada refresco, y jamas bloquea el arranque.
   */
  private notifyOpen(): void {
    const FLAG = "expedicion-diamante:opened";
    try {
      if (sessionStorage.getItem(FLAG)) return;
      sessionStorage.setItem(FLAG, "1");
    } catch {
      return; // sin sessionStorage no se puede evitar duplicar: mejor no enviar
    }

    // Import normal, no dinamico. Lo era para no cargar el cliente de
    // red hasta hacer falta, pero ahora los avisos de progreso lo
    // importan desde media docena de escenas y acaba en el paquete
    // principal igual: el import dinamico ya no ahorraba nada y encima
    // dejaba el modulo partido en dos formas de cargarlo.
    void reportOpen();
  }
}

/** Color de fondo del canvas, para que index.html y Phaser coincidan. */
export const CANVAS_BG = css(INK.void);
