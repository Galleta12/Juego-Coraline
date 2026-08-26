import Phaser from "phaser";

/**
 * Efectos de impacto.
 *
 * Sin esto, golpear se siente como si no pasara nada: el bloque cambia
 * de sprite y ya. Un anillo que se abre, chispas que salen en la
 * direccion del golpe y una micropausa hacen que el impacto tenga peso,
 * y cuestan mucho menos que cualquier arte nuevo.
 */

/** Anillo que se abre desde el punto de impacto. */
export function impactRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  radius = 34,
): void {
  const ring = scene.add.circle(x, y, 6).setDepth(31);
  ring.setStrokeStyle(3, color, 0.9);
  ring.isFilled = false;
  scene.tweens.add({
    targets: ring,
    radius,
    alpha: 0,
    duration: 260,
    ease: "Quad.easeOut",
    onUpdate: () => ring.setRadius(ring.radius),
    onComplete: () => ring.destroy(),
  });
}

/**
 * Chispas en la direccion del golpe.
 *
 * Salen en un cono alrededor de `angle`, no en todas direcciones: asi
 * se lee de donde vino el impacto.
 */
export function sparks(
  scene: Phaser.Scene,
  x: number,
  y: number,
  angle: number,
  color: number,
  count = 9,
): void {
  for (let i = 0; i < count; i++) {
    const size = 2 + Math.random() * 3;
    const p = scene.add.rectangle(x, y, size, size, color).setDepth(32);
    const spread = angle + Math.PI + (Math.random() - 0.5) * 1.6;
    const dist = 18 + Math.random() * 46;
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(spread) * dist,
      y: y + Math.sin(spread) * dist + 14,
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 260 + Math.random() * 220,
      ease: "Quad.easeOut",
      onComplete: () => p.destroy(),
    });
  }
}

/** Polvo al aterrizar o al correr. */
export function dust(scene: Phaser.Scene, x: number, y: number, count = 6): void {
  for (let i = 0; i < count; i++) {
    const p = scene.add
      .circle(x, y, 2 + Math.random() * 3, 0xb9a98c, 0.5)
      .setDepth(19);
    const dir = (Math.random() - 0.5) * 2;
    scene.tweens.add({
      targets: p,
      x: x + dir * (18 + Math.random() * 26),
      y: y - 6 - Math.random() * 14,
      alpha: 0,
      scale: 1.9,
      duration: 380 + Math.random() * 220,
      onComplete: () => p.destroy(),
    });
  }
}

/**
 * Micropausa al impactar.
 *
 * Parar el mundo unas centesimas hace que el golpe se sienta solido. Es
 * el truco mas barato y mas efectivo que existe para esto.
 */
export function hitStop(scene: Phaser.Scene, ms = 55): void {
  if (scene.physics.world.isPaused) return;
  scene.physics.world.pause();
  scene.time.delayedCall(ms, () => scene.physics.world.resume());
}

/**
 * Subidon de cafeina.
 *
 * Vapor que sube, granos saltando y un anillo dorado. Sin esto el cafe
 * era invisible: cambiaban unos numeros y nada mas, y lo unico que
 * delataba que lo habias tomado era la barra del HUD.
 */
export function coffeeRush(scene: Phaser.Scene, x: number, y: number): void {
  impactRing(scene, x, y, 0xffcf6a, 120);

  // Vapor: volutas que suben y se abren.
  for (let i = 0; i < 16; i++) {
    const p = scene.add
      .circle(x + (Math.random() - 0.5) * 40, y, 3 + Math.random() * 5, 0xfff0d0, 0.5)
      .setDepth(33)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: p,
      y: y - 90 - Math.random() * 90,
      x: p.x + (Math.random() - 0.5) * 70,
      scale: 2.4,
      alpha: 0,
      duration: 900 + Math.random() * 700,
      ease: "Sine.easeOut",
      onComplete: () => p.destroy(),
    });
  }

  // Granos de cafe saltando.
  for (let i = 0; i < 10; i++) {
    const bean = scene.add
      .ellipse(x, y - 10, 7, 5, 0x5a3216)
      .setDepth(33)
      .setStrokeStyle(1, 0x2a1608, 0.8);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    scene.tweens.add({
      targets: bean,
      x: x + Math.cos(a) * (70 + Math.random() * 70),
      y: y + Math.sin(a) * (70 + Math.random() * 60) + 90,
      angle: (Math.random() - 0.5) * 700,
      alpha: 0,
      duration: 800 + Math.random() * 400,
      ease: "Quad.easeIn",
      onComplete: () => bean.destroy(),
    });
  }

  // Y un latido de la camara, como el corazon acelerando.
  scene.cameras.main.zoomTo(1.04, 130, "Quad.easeOut");
  scene.time.delayedCall(150, () => scene.cameras.main.zoomTo(1, 260, "Quad.easeOut"));
}

/** Destello corto de pantalla. Para golpes fuertes, no para cada toque. */
export function flash(scene: Phaser.Scene, color: number, ms = 120): void {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  scene.cameras.main.flash(ms, r, g, b, false);
}
