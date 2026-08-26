import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";
import { INK } from "@/config/palette";
import { hasArt } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";

/**
 * Cartas de transicion entre tramos.
 *
 * Al acabar cada parte del juego se ensena una lamina a pantalla
 * completa. Son dibujos llenos de referencias — la gracia esta en
 * mirarlos — asi que se quedan puestos el tiempo justo: ni tan poco que
 * no de tiempo a pillar la referencia, ni tanto que se haga esperar.
 *
 * Cada carta trae su propio color de ambiente, sacado de la lamina, y
 * ese color tiñe las motas y el resplandor. Asi el corte no se lee como
 * "una imagen cualquiera": cada tramo tiene su propio tono.
 */

interface Card {
  key: string;
  /** Color de las motas y el halo que respira. Sale de la propia lamina. */
  tint: number;
  /**
   * Fondo pintado, para las laminas que vienen SIN fondo.
   *
   * `trastion_despues_nivel1.png`, `transicion_despues_cave.png` y
   * `transicion_despues_boss.png` son recortes a transparencia: un
   * personaje flotando en el aire. Sin esto detras se veian sobre negro
   * liso, como una pegatina puesta encima de la pantalla de carga. El
   * degradado va de `from` (el color de la propia lamina) a `to` (el
   * void del juego), asi que el dibujo parece salir de una escena y no
   * de la nada.
   *
   * Las laminas que SI traen su fondo pintado (el tutorial, las cuatro
   * del remate) no llevan esto: pintar un degradado detras de un fondo
   * ya opaco no se veria nunca.
   */
  bg?: { from: number; to: number };
}

export const CARDS: Record<string, Card> = {
  // "Pero... quiero comprobar algo." Primera mitad del chiste.
  tutorial1: { key: "screens/after-tutorial-1", tint: 0x8d6a4a },
  // "¿Eres pro player? Ah...." El remate.
  tutorial2: { key: "screens/after-tutorial-2", tint: 0x8d6a4a },
  // Hannibal con el ramo de tulipanes: ciruela oscuro.
  forest: {
    key: "screens/after-forest",
    tint: 0xb43a78,
    bg: { from: 0x3a1330, to: 0x08060e },
  },
  // El grupo, con Snoopy boxeador y el batido: rojo calido de noche.
  cave: {
    key: "screens/after-cave",
    tint: 0xd8645a,
    bg: { from: 0x3a1a16, to: 0x08060e },
  },
  // Snoopy con las mandarinas y el cafe: ambar calido.
  boss: {
    key: "screens/after-boss",
    tint: 0xd9822f,
    bg: { from: 0x3a2410, to: 0x08060e },
  },
};

export type CardKey = keyof typeof CARDS;

/** Lo que tarda una carta de principio a fin, en milisegundos. */
const HOLD_MS = 2500;
const IN_MS = 560;
const OUT_MS = 520;

export const cardArtKeys = (): string[] =>
  Object.values(CARDS)
    .map((c) => c.key)
    .filter(hasArt);

/** Prefijo de las texturas de degradado, una por color de `bg`. */
const BG_TEX_PREFIX = "gfx-card-bg-";

/**
 * Genera (una vez) la textura de degradado para un fondo de carta.
 *
 * Radial y centrado: es lo que hace que un dibujo recortado a
 * transparencia parezca tener profundidad detras, en vez de una mancha
 * de color plana pegada a la pantalla.
 */
function buildCardBackdrop(scene: Phaser.Scene, from: number, to: number): string {
  const key = `${BG_TEX_PREFIX}${from.toString(16)}`;
  if (scene.textures.exists(key)) return key;

  const w = GAME_WIDTH;
  const h = GAME_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return key;

  const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
  const grad = g.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, h * 0.98);
  grad.addColorStop(0, hex(from));
  grad.addColorStop(0.55, hex(from));
  grad.addColorStop(1, hex(to));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  scene.textures.addCanvas(key, canvas);
  return key;
}

/**
 * Ensena una carta y resuelve cuando termina.
 *
 * `skippable` deja adelantarla con una tecla o un clic. En el remate
 * final va a false: ahi la musica manda y saltar una lamina descuadra
 * el corte con la cancion.
 */
export function showCard(
  scene: Phaser.Scene,
  card: CardKey,
  opts: { holdMs?: number; skippable?: boolean; duckAudio?: boolean } = {},
): Promise<void> {
  const def = CARDS[card];
  const { holdMs = HOLD_MS, skippable = true, duckAudio = true } = opts;

  if (!def || !hasArt(def.key) || !scene.textures.exists(def.key)) {
    return Promise.resolve();
  }

  // Un volumen un poco mas bajo mientras dura la carta: la pausa se
  // siente como tension, no como una pantalla de carga cualquiera. La
  // que sigue a la pelea del jefe queda fuera: ahi ya suena en silencio
  // (la musica de la victoria es "none"), asi que no hay nada que bajar.
  if (duckAudio) audio.duckMusic(true);

  return new Promise<void>((resolve) => {
    const veil = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, INK.void, 1)
      .setOrigin(0)
      .setDepth(900)
      .setScrollFactor(0);

    const bits: Phaser.GameObjects.GameObject[] = [veil];

    // El fondo pintado, solo si la carta lo pide. Va por ENCIMA del
    // void (que se queda de base, por si el degradado no llegase a
    // cubrir alguna esquina) y por DEBAJO del halo y de la lamina.
    let backdrop: Phaser.GameObjects.Image | null = null;
    if (def.bg) {
      const texKey = buildCardBackdrop(scene, def.bg.from, def.bg.to);
      backdrop = scene.add
        .image(0, 0, texKey)
        .setOrigin(0)
        .setDepth(900.2)
        .setScrollFactor(0)
        .setAlpha(0);
      bits.push(backdrop);
    }

    const img = scene.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, def.key)
      .setDepth(901)
      .setScrollFactor(0)
      .setAlpha(0);

    // Entra cabiendo entera: son laminas verticales y recortarlas por
    // los lados se come justo las referencias de las esquinas.
    const fit = Math.min(GAME_WIDTH / img.width, GAME_HEIGHT / img.height) * 0.96;
    img.setScale(fit * 0.94);

    // Halo del color de la carta, por detras de la lamina: la despega
    // del negro y le da el tono del tramo que se acaba de jugar.
    const halo = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, def.tint, 0)
      .setOrigin(0)
      .setDepth(900.5)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD);

    bits.push(img, halo);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (duckAudio) audio.duckMusic(false);
      scene.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, finish);
      motes.remove();
      scene.tweens.add({
        targets: bits,
        alpha: 0,
        duration: OUT_MS,
        onComplete: () => {
          for (const b of bits) b.destroy();
          resolve();
        },
      });
    };

    if (backdrop) {
      scene.tweens.add({ targets: backdrop, alpha: 1, duration: IN_MS + 200 });
      // El fondo respira un pelin mas despacio que el halo: dos ritmos
      // iguales encima del otro se leen como parpadeo, no como vida.
      scene.tweens.add({
        targets: backdrop,
        alpha: 0.86,
        duration: 2600,
        delay: IN_MS + 200,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    scene.tweens.add({
      targets: img,
      alpha: 1,
      scale: fit,
      duration: IN_MS,
      ease: "Quad.easeOut",
    });
    scene.tweens.add({
      targets: halo,
      fillAlpha: 0.14,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    // Acercamiento lento durante toda la parada: da la sensacion de que
    // la camara se mete en el dibujo.
    scene.tweens.add({
      targets: img,
      scale: fit * 1.05,
      duration: holdMs,
      delay: IN_MS,
      ease: "Sine.easeInOut",
    });

    // Motas del color de la carta subiendo por delante.
    const motes = scene.time.addEvent({
      delay: 130,
      loop: true,
      callback: () => {
        const x = Math.random() * GAME_WIDTH;
        const p = scene.add
          .circle(x, GAME_HEIGHT + 10, 1.5 + Math.random() * 3, def.tint, 0.6)
          .setDepth(902)
          .setScrollFactor(0)
          .setBlendMode(Phaser.BlendModes.ADD);
        bits.push(p);
        scene.tweens.add({
          targets: p,
          y: -20,
          x: x + (Math.random() - 0.5) * 160,
          alpha: 0,
          duration: 3200 + Math.random() * 2600,
          onComplete: () => p.destroy(),
        });
      },
    });

    scene.time.delayedCall(IN_MS + holdMs, finish);

    if (skippable) {
      // La ventana de salto se abre tarde a proposito: si no, el clic
      // con el que se acabo el nivel se lleva la carta por delante
      // antes de que se llegue a ver.
      scene.time.delayedCall(900, () => {
        if (done) return;
        scene.input.keyboard?.once(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, finish);
        scene.input.once(Phaser.Input.Events.POINTER_DOWN, finish);
      });
    }
  });
}
