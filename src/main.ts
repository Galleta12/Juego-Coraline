import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, PHYSICS } from "@/config/game";
import { INK, css } from "@/config/palette";
import { BootScene } from "@/scenes/BootScene";
import { NameScene } from "@/scenes/NameScene";
import { StorybookScene } from "@/scenes/StorybookScene";
import { CharacterSelectScene } from "@/scenes/CharacterSelectScene";
import { ProPlayerTransitionScene, TutorialScene } from "@/scenes/TutorialScene";
import { ForestLevelScene } from "@/scenes/ForestLevelScene";
import { TunnelScene } from "@/scenes/TunnelScene";
import { BossScene } from "@/scenes/BossScene";
import { FinaleScene } from "@/scenes/FinaleScene";
import { TrueMissionScene } from "@/scenes/TrueMissionScene";
import { ChoiceScene } from "@/scenes/ChoiceScene";
import { GertrudisScene } from "@/scenes/GertrudisScene";
import { ScheduleScene } from "@/scenes/ScheduleScene";
import { TicketScene } from "@/scenes/TicketScene";
import { HudScene } from "@/scenes/HudScene";
import { getState, resetProgress, setState } from "@/systems/GameState";
import { audio } from "@/systems/AudioSystem";

/**
 * Arranque del juego.
 *
 * 960x540 logicos escalados a la ventana. A diferencia del pixel art,
 * este arte esta dibujado a alta resolucion, asi que no hace falta
 * escalar por multiplos enteros: FIT llena cualquier pantalla sin
 * bordes y sin que tiemble nada.
 */
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: css(INK.void),
  roundPixels: true,
  disableContextMenu: true,
  scale: {
    // ENVELOP, no FIT.
    //
    // FIT mete el juego entero dentro de la ventana, y en una pantalla
    // mas ancha que 16:9 eso deja franjas negras a los lados — en un
    // monitor de 2.05:1 sobraban 258 px por lado y las laminas del
    // final se veian como una postal en medio del vacio.
    //
    // ENVELOP escala hasta CUBRIR la ventana y recorta lo que sobra.
    // Se pierden unos 36 px logicos por arriba y por abajo en pantallas
    // muy anchas, y por eso el HUD y los carteles viven dentro de un
    // margen de seguridad (`SAFE` en config/game.ts) en vez de pegados
    // al borde.
    mode: Phaser.Scale.ENVELOP,
    // El centrado lo hace el CSS del contenedor. autoCenter de Phaser
    // trabaja poniendo margenes al canvas y, combinado con cualquier
    // centrado por CSS, el lienzo acaba desplazado.
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: {
    antialias: true,
    powerPreference: "high-performance",
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: PHYSICS.gravityY },
      debug: false,
    },
  },
  scene: [
    BootScene,
    NameScene,
    StorybookScene,
    CharacterSelectScene,
    TutorialScene,
    ProPlayerTransitionScene,
    ForestLevelScene,
    TunnelScene,
    BossScene,
    FinaleScene,
    TrueMissionScene,
    ChoiceScene,
    GertrudisScene,
    ScheduleScene,
    TicketScene,
    HudScene,
  ],
});

game.events.once(Phaser.Core.Events.READY, () => {
  document.getElementById("boot")?.removeAttribute("data-on");
  game.scale.refresh();
});

// Al abrir barras del navegador o cambiar de pantalla, el contenedor
// cambia de tamano y Phaser no siempre se entera a tiempo. Un refresco
// recoloca el lienzo en el centro.
window.addEventListener("resize", () => game.scale.refresh());

// Solo en desarrollo: saltar de escena y forzar estado desde la consola
// o desde los scripts de QA. Vite lo elimina del build de produccion.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __game: game,
    __state: { get: getState, set: setState, reset: resetProgress },
    // Que pista suena ahora mismo. Lo usa el QA: sin esto no habia forma
    // de comprobar que la musica arranca de verdad y no solo que esta
    // declarada en el config.
    __audioDebug: () => audio.nowPlaying(),
  });
}
