import Phaser from "phaser";
import { COFFEE, GAME_WIDTH, SAFE } from "@/config/game";
import { INK } from "@/config/palette";
import { S } from "@/config/scenes";
import { ITEM, WEAPON, queue } from "@/systems/Art";
import { audio } from "@/systems/AudioSystem";
import { coffeeRemaining, getState } from "@/systems/GameState";
import { label, shadow, title } from "@/ui/text";

/**
 * Interfaz de juego.
 *
 * Corre en paralelo a los niveles, asi que sobrevive a los cambios de
 * escena y no hay que reconstruirla en cada uno.
 *
 * La vida son porciones de torta de chocolate, no corazones: es la broma
 * central del juego y tiene que verse a la primera.
 */
export class HudScene extends Phaser.Scene {
  private slices: Phaser.GameObjects.Image[] = [];
  private keyIcon!: Phaser.GameObjects.Image;
  private keyLabel!: Phaser.GameObjects.Text;
  private gunIcon!: Phaser.GameObjects.Image;
  private coffeeIcon!: Phaser.GameObjects.Image;
  private coffeeBar!: Phaser.GameObjects.Rectangle;
  private coffeeFrame!: Phaser.GameObjects.Rectangle;
  private coffeeText!: Phaser.GameObjects.Text;
  private root!: Phaser.GameObjects.Container;
  private objective!: Phaser.GameObjects.Text;
  private objectiveDot!: Phaser.GameObjects.Arc;
  private banner!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private bannerTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: S.Hud, active: false });
  }

  preload(): void {
    queue(this, [ITEM.cake, ITEM.key, ITEM.coffee, WEAPON.gun]);
  }

  create(): void {
    // Bajado al margen seguro: en pantallas anchas el lienzo se
    // recorta por arriba y el HUD se quedaba medio fuera.
    this.root = this.add.container(0, SAFE - 20).setDepth(1000);
    this.slices = [];

    const st = getState();
    for (let i = 0; i < st.maxCake; i++) {
      const s = this.add
        .image(20 + i * 34, 18, ITEM.cake)
        .setOrigin(0, 0)
        .setScale(0.36);
      this.slices.push(s);
      this.root.add(s);
    }

    // Inventario: pico, arma y llave. Aparecen segun se consiguen.
    this.gunIcon = this.add.image(64, 70, WEAPON.gun).setOrigin(0, 0).setScale(0.3);
    this.keyIcon = this.add.image(112, 66, ITEM.key).setOrigin(0, 0).setScale(0.34);
    this.keyLabel = this.add.text(112, 104, "✓", label(15, INK.gold)).setOrigin(0, 0);
    this.root.add([this.gunIcon, this.keyIcon, this.keyLabel]);

    // Cafe: solo visible mientras dura.
    this.coffeeIcon = this.add.image(22, 122, ITEM.coffee).setOrigin(0, 0).setScale(0.3);
    this.coffeeFrame = this.add.rectangle(58, 132, 90, 6, INK.void).setOrigin(0, 0);
    this.coffeeBar = this.add.rectangle(58, 132, 90, 6, INK.gold).setOrigin(0, 0);
    this.coffeeText = this.add.text(58, 142, "", label(12, INK.gold)).setOrigin(0, 0);
    this.root.add([this.coffeeIcon, this.coffeeFrame, this.coffeeBar, this.coffeeText]);

    // Objetivo actual: se queda en pantalla hasta que se cumple. Un
    // aviso que se desvanece no sirve si la jugadora aun no sabe que
    // tiene que hacer.
    this.objectiveDot = this.add
      .circle(GAME_WIDTH / 2 - 4, 34, 4, INK.gold)
      .setOrigin(0.5)
      .setAlpha(0);
    this.objective = shadow(
      this.add.text(GAME_WIDTH / 2 + 10, 34, "", label(17, INK.bone)).setOrigin(0.5),
    );
    this.objective.setAlpha(0);
    this.root.add([this.objectiveDot, this.objective]);
    this.tweens.add({
      targets: this.objectiveDot,
      scale: 1.6,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Aviso central: objetivos y sucesos.
    this.banner = shadow(
      this.add.text(GAME_WIDTH / 2, 150, "", title(40, INK.bone)).setOrigin(0.5),
    );
    this.bannerSub = shadow(
      this.add.text(GAME_WIDTH / 2, 190, "", label(18, INK.boneDim)).setOrigin(0.5),
    );
    this.banner.setAlpha(0).setDepth(1001);
    this.bannerSub.setAlpha(0).setDepth(1001);

    this.refresh();
    this.setCoffee(0);
  }

  /**
   * El HUD vive entre escenas, asi que se repinta solo cada frame.
   *
   * Antes dependia de que cada escena se acordara de llamarlo, y en el
   * bosque nadie lo hacia: la barra de cafe se quedaba llena de la
   * partida anterior y parecia que el estado no se actualizaba.
   */
  override update(): void {
    this.setCoffee(coffeeRemaining());
  }

  /** Repinta vida e inventario. La llaman las escenas al cambiar algo. */
  refresh(): void {
    const st = getState();
    this.slices.forEach((s, i) => {
      const full = i < Math.floor(st.cake);
      const half = !full && i < st.cake;
      s.setAlpha(full ? 1 : half ? 0.6 : 0.18);
      s.setTint(full || half ? 0xffffff : 0x4a3f52);
      s.setScale(full ? 0.36 : 0.32);
    });

    this.gunIcon.setVisible(st.hasGun);
    this.keyIcon.setVisible(st.hasKey || st.hasFinalKey);
    this.keyLabel.setVisible(st.hasKey || st.hasFinalKey);
  }

  /** Golpe recibido: la porcion que se pierde se sacude antes de irse. */
  flashDamage(): void {
    const st = getState();
    const idx = Math.min(this.slices.length - 1, Math.floor(st.cake));
    const s = this.slices[idx];
    if (!s) return;
    this.tweens.add({
      targets: s,
      angle: { from: -14, to: 14 },
      duration: 70,
      yoyo: true,
      repeat: 2,
      onComplete: () => s.setAngle(0),
    });
  }

  /** Curacion: la porcion recuperada da un salto. */
  flashHeal(): void {
    const st = getState();
    const idx = Math.max(0, Math.floor(st.cake) - 1);
    const s = this.slices[idx];
    if (!s) return;
    this.tweens.add({
      targets: s,
      scale: { from: 0.55, to: 0.36 },
      duration: 340,
      ease: "Back.easeOut",
    });
  }

  setCoffee(remainingMs: number): void {
    const active = remainingMs > 0;
    const alpha = active ? 1 : 0;
    this.coffeeIcon.setAlpha(alpha);
    this.coffeeFrame.setAlpha(alpha * 0.4);
    this.coffeeBar.setAlpha(alpha);
    this.coffeeText.setAlpha(alpha);
    if (!active) return;
    this.coffeeBar.setDisplaySize(90 * (remainingMs / COFFEE.durationMs), 6);
    this.coffeeText.setText(`${(remainingMs / 1000).toFixed(1)} s`);
  }

  /** Aviso grande: objetivos, sucesos, remates. */
  announce(text: string, sub = "", durationMs = 2400, tint: number = INK.bone): void {
    this.bannerTimer?.remove();

    // La cancion se aparta mientras el cartel esta en pantalla.
    //
    // Estos avisos son las frases que hay que leer si o si, y competian
    // de tu a tu con la musica. Baja a dos tercios — no se va, solo deja
    // sitio — y vuelve sola cuando el cartel se retira.
    audio.duckMusic(true, 220);
    this.banner.setText(text).setTint(tint);
    this.bannerSub.setText(sub);

    this.tweens.killTweensOf([this.banner, this.bannerSub]);
    this.banner.setAlpha(0).setY(140);
    this.bannerSub.setAlpha(0);

    this.tweens.add({
      targets: this.banner,
      alpha: 1,
      y: 150,
      duration: 260,
      ease: "Cubic.easeOut",
    });
    this.tweens.add({
      targets: this.bannerSub,
      alpha: sub ? 1 : 0,
      duration: 260,
      delay: 140,
    });

    this.bannerTimer = this.time.delayedCall(durationMs, () => {
      audio.duckMusic(false, 420);
      this.tweens.add({
        targets: [this.banner, this.bannerSub],
        alpha: 0,
        duration: 340,
      });
    });
  }

  /** Objetivo actual. Se queda hasta que alguien lo cambie o lo quite. */
  setObjective(text: string): void {
    this.objective.setText(text);
    const half = this.objective.width / 2;
    this.objective.setX(GAME_WIDTH / 2 + 10);
    this.objectiveDot.setX(GAME_WIDTH / 2 + 10 - half - 14);
    this.tweens.add({ targets: [this.objective, this.objectiveDot], alpha: 1, duration: 300 });
  }

  clearObjective(): void {
    this.tweens.add({ targets: [this.objective, this.objectiveDot], alpha: 0, duration: 300 });
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
  }
}
