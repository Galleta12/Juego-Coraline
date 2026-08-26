import Phaser from "phaser";
import { hasArt } from "@/systems/Art";
import { isCoffeeActive } from "@/systems/GameState";

/**
 * Aura de cafe alrededor de la heroina.
 *
 * Mientras el cafe esta activo le giran gotas y granos alrededor. Antes
 * el cafe solo daba un chispazo al recogerlo y despues no se notaba
 * nada: la jugadora corria y saltaba mas sin saber por que, y cuando se
 * acababa tampoco se enteraba. Esto lo hace visible todo el rato, que
 * es de lo que se trata.
 *
 * El aura se enciende y se apaga sola mirando el estado; la escena solo
 * tiene que crearla y llamar a `tick`.
 */

const BEANS = ["fx/coffee-bean-1", "fx/coffee-bean-2", "fx/coffee-bean-3", "fx/coffee-bean-4"];
const DROPS = [
  "fx/coffee-drop-1",
  "fx/coffee-drop-2",
  "fx/coffee-drop-3",
  "fx/coffee-drop-4",
  "fx/coffee-drop-5",
  "fx/coffee-drop-6",
];

/** Claves de arte que hay que cargar para que el aura se vea. */
export const coffeeArtKeys = (): string[] => [...BEANS, ...DROPS].filter(hasArt);

interface Orbiter {
  img: Phaser.GameObjects.Image;
  /** Angulo actual, en radianes. */
  angle: number;
  speed: number;
  radius: number;
  /** Cuanto sube y baja respecto al centro. */
  lift: number;
  spin: number;
}

const COUNT = 9;

export class CoffeeAura {
  private readonly parts: Orbiter[] = [];
  private on = false;

  constructor(private readonly scene: Phaser.Scene) {
    const pool = [...DROPS, ...BEANS].filter(hasArt);
    if (pool.length === 0) return;

    for (let i = 0; i < COUNT; i++) {
      const key = pool[i % pool.length]!;
      const img = scene.add
        .image(0, 0, key)
        .setDepth(19) // justo detras de la heroina, que va en 20
        .setVisible(false)
        .setBlendMode(Phaser.BlendModes.ADD);

      // Tamano fijo en pantalla: los recortes vienen de tamanos muy
      // distintos y sin esto unas particulas salian el triple que otras.
      const size = 13 + Math.random() * 9;
      img.setDisplaySize(size, size * (img.height / img.width));

      this.parts.push({
        img,
        angle: (i / COUNT) * Math.PI * 2,
        speed: 2.1 + Math.random() * 1.5,
        radius: 26 + Math.random() * 20,
        lift: 16 + Math.random() * 20,
        spin: (Math.random() - 0.5) * 5,
      });
    }
  }

  /** Llamar cada frame con la posicion de los pies de la heroina. */
  tick(x: number, y: number, delta: number): void {
    const active = isCoffeeActive();

    if (active !== this.on) {
      this.on = active;
      for (const p of this.parts) {
        this.scene.tweens.killTweensOf(p.img);
        p.img.setVisible(true);
        this.scene.tweens.add({
          targets: p.img,
          alpha: active ? 0.9 : 0,
          duration: active ? 260 : 420,
          onComplete: () => {
            if (!active) p.img.setVisible(false);
          },
        });
      }
    }
    if (!active && !this.parts.some((p) => p.img.visible)) return;

    const dt = delta / 1000;
    for (const p of this.parts) {
      p.angle += p.speed * dt;
      // Orbita aplastada: mas ancha que alta, para que se lea como que
      // giran ALREDEDOR y no como un anillo plano de frente.
      p.img.x = x + Math.cos(p.angle) * p.radius;
      p.img.y = y - 42 + Math.sin(p.angle) * p.lift * 0.5;
      p.img.angle += p.spin;
      // Las de delante tapan a la heroina, las de detras no.
      p.img.setDepth(Math.sin(p.angle) > 0 ? 21 : 19);
    }
  }

  destroy(): void {
    for (const p of this.parts) p.img.destroy();
    this.parts.length = 0;
  }
}
