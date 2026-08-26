/** Claves de escena. Objeto const en vez de strings sueltos por el codigo. */
export const S = {
  Boot: "BootScene",
  /** Lo primero: escribir el nombre. */
  Name: "NameScene",
  Storybook: "StorybookScene",
  CharacterSelect: "CharacterSelectScene",
  Tutorial: "TutorialScene",
  ProPlayerTransition: "ProPlayerTransitionScene",
  Forest: "ForestLevelScene",
  Tunnel: "TunnelScene",
  Boss: "BossScene",
  /** Las cuatro laminas con la cancion, entre ganar y la pregunta. */
  Finale: "FinaleScene",
  TrueMission: "TrueMissionScene",
  /** Diamantes, pelicula o NO. */
  Choice: "ChoiceScene",
  /** "Buenas elecciones, Gertrudis acepta". */
  Gertrudis: "GertrudisScene",
  Schedule: "ScheduleScene",
  Ticket: "TicketScene",
  /** Corre en paralelo por encima del gameplay. */
  Hud: "HudScene",
} as const;

export type SceneKey = (typeof S)[keyof typeof S];

/** Escenas que valen como punto de retorno al morir. */
export const CHECKPOINT_SCENES: SceneKey[] = [
  S.Tutorial,
  S.Forest,
  S.Tunnel,
  S.Boss,
  S.TrueMission,
];
