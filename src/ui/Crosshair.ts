import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/config/game";

/**
 * Mira de la pistola Monster.
 *
 * Sustituye al cursor del sistema mientras se juega. Un puntero de
 * escritorio encima de un bosque de cuento rompe la ilusion, y ademas
 * cuesta verlo sobre fondo oscuro: esta mira brilla y late.
 *
 * Las tres marcas de zarpa son el guino a la lata; el circulo y las
 * cuatro puas son lo que hace legible hacia donde se apunta.
 */

const TEX = "gfx-crosshair";
const GREEN = "#9bef4f";

function buildTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX)) return;

  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return;

  const c = size / 2;

  // Halo suave, para que la mira no se pierda sobre el fondo oscuro.
  const halo = g.createRadialGradient(c, c, 2, c, c, c);
  halo.addColorStop(0, "rgba(155,239,79,0.20)");
  halo.addColorStop(1, "rgba(155,239,79,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);

  g.strokeStyle = GREEN;
  g.lineCap = "round";

  // Anillo abierto
  g.lineWidth = 3;
  for (const [from, to] of [
    [-0.6, 0.6],
    [Math.PI - 0.6, Math.PI + 0.6],
  ] as const) {
    g.beginPath();
    g.arc(c, c, 26, from, to);
    g.stroke();
  }

  // Puas
  g.lineWidth = 3.5;
  const spikes: [number, number][] = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  for (const [dx, dy] of spikes) {
    g.beginPath();
    g.moveTo(c + dx * 12, c + dy * 12);
    g.lineTo(c + dx * 22, c + dy * 22);
    g.stroke();
  }

  // Tres zarpazos: la marca de la lata.
  g.lineWidth = 2.4;
  g.globalAlpha = 0.9;
  for (let i = -1; i <= 1; i++) {
    const off = i * 7;
    g.beginPath();
    g.moveTo(c + off - 5, c - 34);
    g.quadraticCurveTo(c + off, c - 26, c + off + 3, c - 16);
    g.stroke();
  }
  g.globalAlpha = 1;

  // Punto central
  g.fillStyle = "rgba(233,255,208,0.95)";
  g.beginPath();
  g.arc(c, c, 2.6, 0, Math.PI * 2);
  g.fill();

  scene.textures.addCanvas(TEX, canvas);
}

export class Crosshair {
  private readonly sprite: Phaser.GameObjects.Image;

  constructor(private readonly scene: Phaser.Scene) {
    buildTexture(scene);

    this.sprite = scene.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, TEX)
      .setScrollFactor(0)
      .setDepth(9500)
      .setScale(0.62);

    scene.input.setDefaultCursor("none");

    // Late despacio: la mira viva se encuentra antes con el rabillo del ojo.
    scene.tweens.add({
      targets: this.sprite,
      scale: 0.7,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    scene.tweens.add({
      targets: this.sprite,
      angle: 360,
      duration: 14000,
      repeat: -1,
    });

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.follow, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private follow(): void {
    const p = this.scene.input.activePointer;
    this.sprite.setPosition(p.x, p.y);
  }

  /** Golpe visual al disparar. */
  kick(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      scale: 0.95,
      duration: 70,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  setVisible(v: boolean): void {
    this.sprite.setVisible(v);
    this.scene.input.setDefaultCursor(v ? "none" : "default");
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.follow, this);
    this.scene.input.setDefaultCursor("default");
    this.sprite.destroy();
  }
}
