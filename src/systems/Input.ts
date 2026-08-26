import Phaser from "phaser";

/**
 * Entrada del juego.
 *
 * Las escenas preguntan por intenciones ("quiere saltar", "esta
 * apuntando aqui"), nunca por teclas concretas. El salto y las acciones
 * se encolan por evento y no con JustDown: una pulsacion que empieza y
 * acaba dentro del mismo frame se perderia entera.
 */
/**
 * Cuanto tiempo se sigue considerando que se esta apuntando tras mover
 * el raton, en milisegundos.
 */
const AIM_MEMORY_MS = 1200;

export class Input {
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
  private jumpBufferedAt = -Infinity;
  private shootQueued = false;
  private mineQueued = false;
  private interactQueued = false;
  private pointerMovedAt = -Infinity;

  /** true mientras el boton izquierdo sigue pulsado: disparo sostenido. */
  private shootHeld = false;

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error("Este juego necesita teclado");

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      a: kb.addKey(K.A),
      d: kb.addKey(K.D),
      w: kb.addKey(K.W),
      s: kb.addKey(K.S),
      left: kb.addKey(K.LEFT),
      right: kb.addKey(K.RIGHT),
      up: kb.addKey(K.UP),
      down: kb.addKey(K.DOWN),
      space: kb.addKey(K.SPACE),
      e: kb.addKey(K.E),
      r: kb.addKey(K.R),
      m: kb.addKey(K.M),
      esc: kb.addKey(K.ESC),
    };
    kb.addCapture([K.SPACE, K.UP, K.DOWN, K.LEFT, K.RIGHT, K.W, K.A, K.S, K.D]);

    const bufferJump = () => {
      this.jumpBufferedAt = scene.time.now;
    };
    this.keys.space!.on("down", bufferJump);
    this.keys.w!.on("down", bufferJump);
    this.keys.up!.on("down", bufferJump);

    this.keys.e!.on("down", () => {
      this.interactQueued = true;
    });

    scene.input.on(Phaser.Input.Events.POINTER_MOVE, () => {
      this.pointerMovedAt = scene.time.now;
    });

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.mineQueued = true;
      else {
        this.shootQueued = true;
        this.shootHeld = true;
      }
    });
    scene.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (!p.rightButtonReleased()) this.shootHeld = false;
    });
  }

  /** -1, 0 o 1. */
  get moveX(): number {
    const left = this.keys.a!.isDown || this.keys.left!.isDown;
    const right = this.keys.d!.isDown || this.keys.right!.isDown;
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  /** S mantiene: bajar por una plataforma atravesable. */
  get dropThrough(): boolean {
    return this.keys.s!.isDown || this.keys.down!.isDown;
  }

  get jumpHeld(): boolean {
    return this.keys.space!.isDown || this.keys.w!.isDown || this.keys.up!.isDown;
  }

  /** Salto pulsado hace menos de `windowMs`. Lo consume quien lo usa. */
  consumeJump(windowMs: number): boolean {
    if (this.scene.time.now - this.jumpBufferedAt > windowMs) return false;
    this.jumpBufferedAt = -Infinity;
    return true;
  }

  /** Clic izquierdo: disparar. Sostener tambien dispara, en cadencia. */
  get wantsShoot(): boolean {
    if (this.shootQueued) {
      this.shootQueued = false;
      return true;
    }
    return this.shootHeld;
  }

  /** Clic derecho: picar. */
  consumeMine(): boolean {
    const v = this.mineQueued;
    this.mineQueued = false;
    return v;
  }

  /** E: interactuar, abrir puertas. */
  consumeInteract(): boolean {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }

  /** Posicion del raton en coordenadas del mundo. */
  pointerWorld(): { x: number; y: number } {
    const p = this.scene.input.activePointer;
    return { x: p.worldX, y: p.worldY };
  }

  /**
   * ¿Se esta usando el raton ahora mismo?
   *
   * Verdadero si se ha movido hace poco o si hay un boton pulsado. Sirve
   * para decidir hacia donde mira la heroina: si nadie esta apuntando,
   * mira hacia donde camina.
   */
  get aiming(): boolean {
    return this.shootHeld || this.scene.time.now - this.pointerMovedAt < AIM_MEMORY_MS;
  }

  justPressed(key: "r" | "m" | "esc"): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys[key]!);
  }
}
