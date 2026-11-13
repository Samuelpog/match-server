/**
 * Datenmodell von Planet Wars. Diese Datei ist der Vertrag zwischen Engine,
 * Server, Bots und Zuschauer-UI. Sie enthält nur Typen und Konstanten und
 * läuft in Node wie im Browser.
 */

/** Sitzplatz eines Spielers. Sitz 0 ist „Spieler 1", Sitz 1 ist „Spieler 2". */
export type Seat = 0 | 1;

/** Besitzer eines Planeten. `null` heißt neutral. */
export type Owner = Seat | null;

/** Unveränderliche Eigenschaften eines Planeten. `id` ist zugleich der Index in allen Planetenlisten. */
export interface PlanetDef {
  id: number;
  x: number;
  y: number;
  /** Produktionsrate: neue Schiffe je Tick, solange der Planet einem Spieler gehört. */
  growth: number;
}

/** Die Sternenkarte. Punktsymmetrisch um die Mitte, siehe `mapgen.ts`. */
export interface GameMap {
  seed: number;
  width: number;
  height: number;
  /** Fluggeschwindigkeit in Karteneinheiten je Tick. */
  speed: number;
  planets: PlanetDef[];
  /** Heimatplaneten: `homes[0]` gehört Sitz 0, `homes[1]` Sitz 1. */
  homes: [number, number];
  /** Startzustand der Planeten, gleiche Reihenfolge wie `planets`. */
  initial: PlanetState[];
}

/** Veränderlicher Zustand eines Planeten: Besitzer und Garnison. */
export type PlanetState = [owner: Owner, ships: number];

/**
 * Eine Flotte im Flug. Sie startet mit den Befehlen, die auf den Stand von
 * Tick `depart` gegeben wurden, und trifft in Tick `arrive` ein. Zum Zeitpunkt
 * `t` (auch gebrochen) hat sie den Anteil `(t - depart) / (arrive - depart)`
 * der Strecke hinter sich.
 */
export interface Fleet {
  id: number;
  owner: Seat;
  from: number;
  to: number;
  ships: number;
  depart: number;
  arrive: number;
}

/** Ein Flottenbefehl: `ships` Schiffe von Planet `from` nach Planet `to`. */
export interface Order {
  from: number;
  to: number;
  ships: number;
}

export type RejectCode =
  | "malformed"
  | "unknown_planet"
  | "same_planet"
  | "not_owner"
  | "bad_ship_count"
  | "not_enough_ships"
  | "too_many_orders";

/** Ein abgelehnter Befehl. `index` ist die Position in der eingereichten Liste. */
export interface RejectedOrder {
  index: number;
  code: RejectCode;
  message: string;
}

/** Vollständiger Spielzustand nach einem Tick. */
export interface GameState {
  tick: number;
  planets: PlanetState[];
  /** Alle Flotten, die noch unterwegs sind. */
  fleets: Fleet[];
  nextFleetId: number;
}

/**
 * Was in einem Tick an einem Planeten geschah, an dem Flotten ankamen.
 * `before` ist der Stand nach der Produktion dieses Ticks und vor der Ankunft.
 */
export interface PlanetEvent {
  planet: number;
  /** Angekommene Schiffe je Sitz, über alle Flotten summiert. */
  arrivals: [number, number];
  before: PlanetState;
  after: PlanetState;
  /** `true`, wenn der Planet den Besitzer gewechselt hat. */
  captured: boolean;
}

/** Kennzahlen eines Sitzes in einem Frame. */
export interface SeatFrame {
  /** Kamen für den Tick davor rechtzeitig Befehle? In Frame 0 immer `false`. */
  submitted: boolean;
  /** Angenommene und abgelehnte Befehle, die zu diesem Frame geführt haben. */
  accepted: number;
  rejected: number;
  /** Alle Schiffe des Sitzes, auf Planeten und im Flug. */
  ships: number;
  /** Summe der Produktionsraten seiner Planeten. */
  growth: number;
  planets: number;
}

/**
 * Ein Frame je Tick. Frame 0 ist der Startzustand. Die Frames sind zugleich
 * Live-Strom und Replay.
 */
export interface Frame {
  /** Tick, dessen Stand der Frame beschreibt. */
  t: number;
  /** Millisekunden seit Match-Start, zu denen der Tick aufgelöst wurde. */
  at: number;
  /** Stand aller Planeten nach Auflösung von Tick `t`. */
  planets: PlanetState[];
  /** Flotten, die beim Auflösen dieses Ticks gestartet sind (`depart === t - 1`). */
  launches: Fleet[];
  /** Ankünfte und Kämpfe dieses Ticks. */
  events: PlanetEvent[];
  players: [SeatFrame, SeatFrame];
}

export type ResultReason =
  /** Ein Spieler hat keine Planeten und keine Flotten mehr. */
  | "elimination"
  /** Tick-Limit erreicht, mehr Schiffe. */
  | "ships"
  /** Tick-Limit erreicht, gleich viele Schiffe, höhere Produktion. */
  | "growth"
  /** Gleichstand in allem oder beide gleichzeitig ausgelöscht. */
  | "draw"
  /** Das Match wurde abgebrochen. */
  | "aborted";

export interface GameResult {
  /** Sitz des Gewinners, `null` bei Unentschieden oder Abbruch. */
  winner: Seat | null;
  reason: ResultReason;
}

/** Einstellungen der Kartengenerierung. */
export interface MapOptions {
  seed: number;
  /** Anzahl der Planeten, 20 bis 30. */
  planets: number;
}

/** Ein Bot als reine Funktion: sieht Karte und Stand, gibt Befehle zurück. */
export type BotFunction = (input: BotInput) => Order[];

export interface BotInput {
  map: GameMap;
  state: GameState;
  you: Seat;
  tickLimit: number;
}

export const LIMITS = {
  minPlanets: 20,
  maxPlanets: 30,
  minTickLimit: 20,
  maxTickLimit: 1000,
  /** Mehr Befehle je Tick nimmt die Engine nicht an. */
  maxOrdersPerTick: 200,
} as const;

export const DEFAULTS = {
  planets: 24,
  tickLimit: 300,
} as const;
