/**
 * Anzeige-Modell der Zuschauer-Ansicht. Die Ansicht kennt nur diese Typen.
 * Was der Server liefert, übersetzt `adapter.ts` hierher; ein gespeichertes
 * Replay liegt bereits in dieser Form vor.
 */

/** 0 = neutral, 1 = Sitzplatz 1, 2 = Sitzplatz 2. */
export type Owner = 0 | 1 | 2;
export type Player = 1 | 2;

export interface PlanetDef {
  /** Kennung des Servers, nur zur Anzeige. Bezug ist überall der Index in `map.planets`. */
  id: string | number;
  x: number;
  y: number;
  /** Produktionsrate: neue Schiffe je Tick, sobald der Planet jemandem gehört. */
  growth: number;
  /** Radius in Karteneinheiten, falls die Engine einen vorgibt. */
  radius?: number;
}

export interface ArenaMap {
  width: number;
  height: number;
  planets: PlanetDef[];
}

export interface PlanetState {
  owner: Owner;
  ships: number;
}

export interface Fleet {
  id: string;
  owner: Player;
  /** Index des Startplaneten in `map.planets`. */
  from: number;
  /** Index des Zielplaneten in `map.planets`. */
  to: number;
  ships: number;
  /** Tick, in dem die Flotte gestartet ist. */
  launch: number;
  /** Tick, in dem sie ankommt und in den Planetenstand eingeht. */
  arrive: number;
}

/** Wie sich ein Bot in einem Tick gemeldet hat. */
export interface SeatTick {
  /** Kamen die Befehle rechtzeitig? `null`, wenn der Server dazu nichts sagt. */
  onTime: boolean | null;
  /** Anzahl abgelehnter Befehle. */
  invalid: number;
}

export interface Frame {
  t: number;
  /** Stand jedes Planeten nach Auflösung von Tick `t`, Reihenfolge wie `map.planets`. */
  planets: PlanetState[];
  /** Flotten, die in diesem Tick gestartet sind. */
  launches: Fleet[];
  seats?: [SeatTick, SeatTick];
}

export interface PlayerInfo {
  name: string;
  /** `null`: unbekannt (etwa in einem geladenen Replay). */
  online: boolean | null;
  /** Eingebauter Dummy-Bot statt eines Bots von außen. */
  builtIn?: boolean;
}

export type MatchStatus = "waiting" | "running" | "finished";

export interface MatchResult {
  /** `0` heißt Unentschieden. */
  winner: Owner;
  reason: string | null;
}

export interface SeriesInfo {
  id: string;
  bestOf: number;
  /** Nummer dieses Matches in der Serie, bei 1 beginnend. */
  game: number;
  wins: [number, number];
}

export interface MatchMeta {
  id: string;
  status: MatchStatus;
  tickLimit: number;
  /** Solldauer eines Ticks in Millisekunden. */
  tickMs: number;
  players: [PlayerInfo, PlayerInfo];
  result: MatchResult | null;
  series?: SeriesInfo;
}

/** Was in einem Tick an einem Planeten passiert ist. */
export interface PlanetEvent {
  t: number;
  planet: number;
  /** `reinforce`: nur eigene Schiffe kamen an. `battle`: Angriff abgewehrt. `capture`: Besitzer gewechselt. */
  kind: "reinforce" | "battle" | "capture";
  /** Angekommene Schiffe je Spieler, Index 0 = Spieler 1. */
  arrived: [number, number];
  before: PlanetState;
  after: PlanetState;
}

/** Summen eines Ticks je Spieler, Index 0 = Spieler 1. */
export interface TickStats {
  onPlanets: [number, number];
  inFlight: [number, number];
  /** Schiffe auf Planeten plus Schiffe in der Luft. */
  ships: [number, number];
  /** Summe der Produktionsraten aller eigenen Planeten. */
  production: [number, number];
  planets: [number, number];
  neutralPlanets: number;
}

/** Ein vollständiges Match als Datei. */
export interface ReplayFile {
  format: "planetwars-replay";
  version: 1;
  savedAt: string;
  meta: MatchMeta;
  map: ArenaMap;
  frames: Frame[];
}
