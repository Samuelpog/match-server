/**
 * Datenmodell der Rundenstrategie (`a-0004`). Diese Datei ist der Vertrag
 * zwischen Engine, Server, Bots und Zuschauer-Ansicht. Sie enthält nur Typen
 * und Konstanten und läuft in Node wie im Browser.
 *
 * Spätere Stufen fügen nur Felder und Aktionsarten hinzu.
 */

/** Sitzplatz eines Spielers. Sitz 0 ist „Spieler 1", Sitz 1 ist „Spieler 2". */
export type Seat = 0 | 1;

/** Besitzer eines Planeten. `null` heißt neutral. */
export type Owner = Seat | null;

export type BuildingType = "shipyard" | "fortress" | "command" | "radar";

/** Unveränderliche Eigenschaften eines Planeten. `id` ist zugleich der Index in allen Planetenlisten. */
export interface PlanetDef {
  id: number;
  /** Eindeutig je Karte, höchstens 10 Zeichen. */
  name: string;
  x: number;
  y: number;
  /** Neue Schiffe je Runde, solange der Planet einem Spieler gehört. */
  growth: number;
  /** Sitz, dessen Heimatplanet das ist, sonst `null`. */
  home: Seat | null;
  /** Knotenplanet: nur hier lässt sich eine Kommandozentrale bauen. */
  hub: boolean;
  /** Der an der Kartenmitte gespiegelte Planet. Der Mittelplanet ist sein eigener Zwilling. */
  twin: number;
}

/** Eine Route zwischen zwei Planeten, `a < b`. `length` ist die Flugzeit in Runden. */
export type Route = [a: number, b: number, length: number];

/** Die Sternenkarte. Punktsymmetrisch um die Mitte, siehe `mapgen.ts`. Vollständig öffentlich. */
export interface GameMap {
  seed: number;
  width: number;
  height: number;
  planets: PlanetDef[];
  routes: Route[];
  /** Heimatplaneten: `homes[0]` gehört Sitz 0, `homes[1]` Sitz 1. */
  homes: [number, number];
  /** Knotenplaneten: der Mittelplanet und ein Zwillingspaar an den Flanken. */
  hubs: number[];
  /** Startzustand der Planeten, gleiche Reihenfolge wie `planets`. */
  initial: PlanetState[];
}

/** Veränderlicher Zustand eines Planeten. */
export interface PlanetState {
  owner: Owner;
  ships: number;
  /** Ausbau. Liegt `ready` in der Zukunft, wird noch gebaut. Ab Stufe 2, davor immer `null`. */
  building: { type: BuildingType; ready: number } | null;
  /** Ziel der Nachschublinie oder `null`. Ab Stufe 2, davor immer `null`. */
  supply: number | null;
}

/**
 * Eine Flotte unterwegs. Sie behält ihre `id` von Start bis Ende. `progress`
 * zählt die geflogenen Runden, bei `progress === length` kommt sie an.
 */
export interface Fleet {
  id: number;
  owner: Seat;
  from: number;
  to: number;
  ships: number;
  progress: number;
  length: number;
  /** Runde der Ankunft. */
  arrive: number;
  /** Nachschub aus einer Linie. Ab Stufe 2, davor immer `false`. */
  supply: boolean;
}

export type Action =
  | { type: "move"; from: number; to: number; ships: number }
  | { type: "build"; planet: number; building: BuildingType }
  | { type: "supply"; planet: number; to: number | null };

export type RejectCode =
  | "bad_action"
  | "bad_planet"
  | "not_owner"
  | "no_route"
  | "bad_ships"
  | "not_enough_ships"
  | "unknown_building"
  | "not_hub"
  | "slot_busy"
  | "not_available"
  | "action_limit";

/** Eine eingereichte Aktion mit ihrem Ergebnis. `action` ist die Eingabe des Bots, unverändert. */
export interface ActionRecord {
  action: unknown;
  ok: boolean;
  /** Grund der Ablehnung. */
  code?: RejectCode;
  /** Bei `move`: die Flotte, in der die Schiffe fliegen. */
  fleet?: number;
}

/** Schritte einer Runde, in dieser Reihenfolge. */
export type Step = "actions" | "move" | "route" | "arrival" | "production" | "build" | "end";

/** Ein Zweikampf auf der Route. `at` ist der Abstand von `route[0]` in Runden, in halben Schritten. */
export interface RouteBattleEvent {
  step: "route";
  kind: "battle";
  route: [number, number];
  at: number;
  fleets: { id: number; owner: Seat; before: number; after: number }[];
}

/** Ankunft an einem Planeten: Verstärkung oder Kampf. */
export interface ArrivalEvent {
  step: "arrival";
  kind: "reinforce" | "battle";
  planet: number;
  /** Die angekommenen Flotten. Sie stehen danach nicht mehr in `fleets`. */
  fleets: number[];
  /** Angekommene Schiffe je Sitz. */
  arrivals: [number, number];
  /** Besatzung vor allen Ankünften dieser Runde. */
  before: { owner: Owner; ships: number };
  /** Stärke der Verteidigung, mit eigener Verstärkung, Festung und Heimatschutz. */
  defense: { strength: number };
  after: { owner: Owner; ships: number };
  captured: boolean;
  /** Ausbau, der bei der Eroberung zerstört wurde. */
  destroyed: BuildingType | null;
}

export interface SupplyEvent {
  step: "production";
  kind: "supply";
  planet: number;
  fleet: number;
  ships: number;
}

export interface BuildEvent {
  step: "build";
  kind: "completed";
  planet: number;
  building: BuildingType;
}

export type GameEvent = RouteBattleEvent | ArrivalEvent | SupplyEvent | BuildEvent;

/** Kennzahlen eines Sitzes in einem Frame. */
export interface SeatFrame {
  /** Kamen für diese Runde rechtzeitig Befehle? In Frame 0 immer `false`. */
  submitted: boolean;
  /** Genutzte Aktionen dieser Runde und das Limit, das für sie galt. */
  actions: { used: number; limit: number };
  /** Punkte, die am Ende entscheiden. */
  score: number;
  /** Alle Schiffe des Sitzes, auf Planeten und unterwegs. */
  ships: number;
  planets: number;
  /** Summe des Wachstums der eigenen Planeten, ohne Werft. */
  growth: number;
  /** Tatsächliche Produktion je Runde, mit Werft. */
  production: number;
}

/** Was ein Sitz sieht. Ab Stufe 4. */
export interface Visibility {
  planets: number[];
  fleets: number[];
}

/** Ein Frame je Runde. Frame 0 ist der Start, Frame `r` der Stand nach Runde `r`. */
export interface Frame {
  round: number;
  /** Millisekunden seit Match-Start, zu denen die Runde aufgelöst wurde. */
  at: number;
  planets: PlanetState[];
  /** Alle Flotten, die nach dieser Runde unterwegs sind. */
  fleets: Fleet[];
  /** Die Aktionen beider Sitze in eingereichter Reihenfolge, auch abgelehnte. */
  actions: [ActionRecord[], ActionRecord[]];
  /** Ereignisse in der Reihenfolge der Schritte. */
  events: GameEvent[];
  players: [SeatFrame, SeatFrame];
  /** `null`: beide sehen alles. */
  visible: [Visibility, Visibility] | null;
}

/** Vollständiger Spielzustand nach einer Runde. */
export interface GameState {
  round: number;
  planets: PlanetState[];
  fleets: Fleet[];
  nextFleetId: number;
}

export type ResultReason =
  /** Der Heimatplanet des Gegners ist erobert. */
  | "home"
  /** Mehr Punkte nach der letzten Runde oder wenn beide Heimatplaneten zugleich fallen. */
  | "points"
  /** Gleiche Punkte, mehr Schiffe. */
  | "ships"
  | "draw"
  | "aborted";

export interface GameResult {
  /** Sitz des Gewinners, `null` bei Unentschieden oder Abbruch. */
  winner: Seat | null;
  reason: ResultReason;
}

/** Zahlenwerte der Regeln. Stehen im Match-Kopf, im Replay und in `health`. */
export interface RuleParams {
  actions: { base: number; max: number };
  home: { ships: number; growth: number; guard: number };
  /** Karteneinheiten, die eine Flotte je Runde zurücklegt. */
  unitsPerRound: number;
  fortressFactor: number;
  shipyardFactor: number;
  scorePerBuilding: number;
  /** Ausbauten, die es in dieser Stufe gibt. */
  buildings: Partial<Record<BuildingType, { cost: number; time: number; hubOnly: boolean }>>;
  /** Aktionsarten, die es in dieser Stufe gibt. */
  actionTypes: Action["type"][];
}

/** Kennung des Regelstands: `rundenstrategie/<Stufe>.<Stand>`. Zählt bei jeder Änderung an Regeln oder Zahlen hoch. */
export const RULES = "rundenstrategie/1.0";

export const PARAMS: RuleParams = {
  actions: { base: 3, max: 5 },
  home: { ships: 30, growth: 4, guard: 15 },
  unitsPerRound: 25,
  fortressFactor: 1.5,
  shipyardFactor: 1.5,
  scorePerBuilding: 2,
  buildings: {},
  actionTypes: ["move"],
};

export interface MapOptions {
  seed: number;
  /** 15 oder 17. */
  planets: number;
}

/** Was ein Bot sieht. Dieselbe Form liefert `GET /api/matches/{id}/state`. */
export interface BotView {
  rules: string;
  params: RuleParams;
  you: Seat;
  /** Runde, für die jetzt Aktionen gefragt sind. */
  round: number;
  rounds: number;
  actions: { limit: number };
  score: [number, number];
  planets: PlanetView[];
  routes: Route[];
  fleets: Fleet[];
}

export interface PlanetView extends PlanetDef, PlanetState {}

/** Ein Bot als reine Funktion: sieht den Stand, gibt Aktionen zurück. */
export type BotFunction = (view: BotView) => Action[];

export const LIMITS = {
  planetCounts: [15, 17],
  minRounds: 20,
  maxRounds: 200,
  /** Mehr Aktionen je Einreichung prüft die Engine nicht. */
  maxActionsChecked: 20,
} as const;

export const DEFAULTS = {
  planets: 15,
  rounds: 120,
} as const;

export const SEATS: readonly Seat[] = [0, 1];
