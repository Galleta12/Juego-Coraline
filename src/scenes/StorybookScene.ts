import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, SAFE } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { BOOK } from "@/config/strings";
import { queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { SceneGrade } from "@/ui/Grade";
import { light, motes } from "@/ui/Atmosphere";
import { label, shadow } from "@/ui/text";

/**
 * Escena 0: el cuaderno.
 *
 * Empieza deliberadamente lejos del gameplay. Una tapa que se abre, dos
 * frases escritas a mano y se cierra. Nada mas: si esto durase mas de
 * veinte segundos ya estaria estorbando.
 *
 * Las paginas son arte, no texto compuesto. Vienen con las frases
 * escritas encima y con todo lo que a ella le gusta repartido por la
 * mesa — el cafe, la torta, el helado, la lata, la lavanda, Snoopy —,
 * asi que el trabajo aqui es solo pasarlas bien.
 */

/** Los cuatro estados, en orden. */
const PAGES = ["ui/book-cover", "ui/book-page1", "ui/book-page2", "ui/book-back"] as const;

export class StorybookScene extends Phaser.Scene {
  private sheet!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.Text;
  private page = 0;
  private busy = true;

  constructor() {
    super(S.Storybook);
  }

  preload(): void {
    queue(this, [...PAGES]);
  }

  create(): void {
    this.page = 0;
    this.busy = true;

    this.cameras.main.setBackgroundColor(INK.void);
    this.cameras.main.fadeIn(700, 8, 6, 14);
    new SceneGrade(this, "storybook");
    void audio.playMusic("intro");
    // El tutorial es lo siguiente: se va descargando mientras se lee.
    void audio.preloadTrack("tutorial");

    // Luz calida sobre la mesa, como la lampara del dibujo.
    light(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, {
      color: 0xffc98a,
      radius: 430,
      intensity: 0.22,
      scrollFactor: 0,
      depth: 0,
    });
    motes(this, { color: 0xffd9a0, count: 18, driftY: -9, scrollFactor: 0 });

    this.sheet = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, PAGES[0])
      .setDepth(10)
      .setAlpha(0);
    this.fit();

    // A 26px del borde se perdia en pantallas anchas: el lienzo va en
    // modo ENVELOP y recorta hasta SAFE px por abajo. Dentro del margen
    // seguro, el aviso se ve siempre.
    this.hint = shadow(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - SAFE - 6, BOOK.hint, label(14, INK.boneDim))
        .setOrigin(0.5)
        .setDepth(20)
        .setAlpha(0),
    );

    // Entra como un cuaderno que alguien deja sobre la mesa.
    this.sheet.setScale(this.sheet.scale * 0.9).setAngle(-4);
    this.tweens.add({
      targets: this.sheet,
      alpha: 1,
      angle: 0,
      scale: this.baseScale(),
      duration: 900,
      ease: "Back.easeOut",
      onComplete: () => {
        this.busy = false;
        this.tweens.add({ targets: this.hint, alpha: 1, duration: 500 });
      },
    });

    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => this.next());
    this.input.keyboard?.on("keydown-SPACE", () => this.next());
    this.input.keyboard?.on("keydown-ENTER", () => this.next());
  }

  /**
   * Escala para que la pagina quepa entera.
   *
   * Las cuatro tienen anchos muy distintos — la tapa cerrada es la mitad
   * de ancha que el cuaderno abierto — asi que cada una se mide aparte.
   */
  private baseScale(): number {
    const tex = this.textures.get(PAGES[this.page]!).getSourceImage();
    // Margen generoso por los cuatro lados.
    //
    // Con 0.86/0.88 la pagina abierta llegaba justo al borde y, con el
    // difuminado, parecia cortada. Ahora cabe entera y se ve que es un
    // cuaderno puesto sobre una mesa, no un fondo.
    return Math.min((GAME_WIDTH * 0.74) / tex.width, (GAME_HEIGHT * 0.72) / tex.height);
  }

  private fit(): void {
    this.sheet.setScale(this.baseScale());
  }

  /** Pasa de pagina, y en la ultima sale de la escena. */
  private next(): void {
    if (this.busy) return;
    this.busy = true;

    if (this.page >= PAGES.length - 1) {
      this.leave();
      return;
    }

    this.page += 1;
    audio.sfx.pageTurn();

    // La hoja se levanta por un lado y vuelve a caer con la siguiente.
    this.tweens.add({
      targets: this.sheet,
      scaleX: 0.02,
      angle: this.page % 2 === 0 ? 3 : -3,
      duration: 240,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.sheet.setTexture(PAGES[this.page]!);
        this.tweens.add({
          targets: this.sheet,
          scaleX: this.baseScale(),
          scaleY: this.baseScale(),
          angle: 0,
          duration: 300,
          ease: "Quad.easeOut",
          onComplete: () => {
            this.busy = false;
          },
        });
      },
    });
  }

  private leave(): void {
    audio.sfx.pageTurn();
    this.tweens.add({ targets: this.hint, alpha: 0, duration: 300 });
    this.tweens.add({
      targets: this.sheet,
      scale: this.baseScale() * 1.06,
      alpha: 0,
      duration: 700,
      ease: "Quad.easeIn",
    });
    this.cameras.main.fadeOut(800, 8, 6, 14);
    this.time.delayedCall(900, () => this.scene.start(S.CharacterSelect));
  }
}
