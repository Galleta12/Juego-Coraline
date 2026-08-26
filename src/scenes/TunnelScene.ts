import { S } from "@/config/scenes";
import { TUNNEL_TXT } from "@/config/strings";
import { TUNNEL_MAP } from "@/systems/levels/tunnel";
import { LevelScene } from "@/scenes/LevelScene";

/**
 * El tunel.
 *
 * Un pasillo de un minuto entre el bosque y la guarida. No hay llave
 * que buscar: la puerta del fondo esta abierta desde el principio y
 * todo el nivel consiste en llegar hasta ella.
 *
 * Luna viene: es la unica compañia aqui. El guia se queda fuera — el
 * tunel es el tramo en el que nadie te explica nada, y que el que habla
 * no este es justo lo que lo hace incomodo.
 */
export class TunnelScene extends LevelScene {
  constructor() {
    super(S.Tunnel, {
      map: TUNNEL_MAP,
      kind: "tunnel",
      parallax: "tunnel",
      grade: "tunnel",
      music: "tunnel",
      nextMusic: "boss",
      next: S.Boss,
      objective: "Atraviesa el túnel",
      keyGot: "",
      backObjective: "Atraviesa el túnel",
      withCat: true,
      withGuide: false,
      withAltered: false,
      card: "cave",
    });
  }

  protected async intro(): Promise<void> {
    // Dice lo suyo desde la entrada y se va. A partir de ahi se cruza
    // sola.
    // A ras de suelo, casi a su altura: en el tunel el hueco de juego es
    // una franja estrecha y flotando alto se salia por arriba del
    // encuadre, con su globo detras.
    await this.guide.enter(this.player.x + 150, this.player.y - 20);
    await this.guide.monologue([
      TUNNEL_TXT.guide1,
      TUNNEL_TXT.guide2,
      TUNNEL_TXT.guide3,
      TUNNEL_TXT.guide4,
    ]);
    this.guide.hideBubble();
    await this.guide.leave();
  }

  protected override onCreated(): void {
    // Sin llave que buscar: la puerta del tunel se abre sola. Meter una
    // segunda busqueda de llave seguida seria repetir el bosque.
    this.gotKey = true;
    this.door?.clearTint();
  }
}
