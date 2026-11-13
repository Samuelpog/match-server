/**
 * Anzeige-Modell der Zuschauer-Ansicht für die Rundenstrategie. Die Ansicht
 * kennt nur diese Typen. Was der Server liefert, übersetzt `adapter.ts`
 * hierher. Der wichtigste Unterschied zum Format des Servers: Die Ansicht
 * spricht von Spieler 1 und Spieler 2, nicht von Sitzen. In einer Serie
 * wechseln die Sitze, die Farben nicht.
 */

/** 0 = neutral, 1 = Spieler 1 (blau, links), 2 = Spieler 2 (orange, rechts). */
export type Owner = 0 | 1 | 2;
export type Player = 1 | 2;

export type BuildingType = "shipyard" | "fortress" | "command" | "radar";

export interface PlanetDef {
  id: number;
  name: string;
  x: number;
  y: number;
  /** Neue Schiffe je Runde, sobald der Planet jemandem gehört. */
  growth: number;
  /** Heimatplanet dieses Spielers, sonst 0. */
  home: Owner;
  /** Knotenplanet: nur hier lässt sich eine Kommandozentrale bauen. */
  hub: boolean;
}

/** Route zwischen zwei Planeten, `a < b`. `length` ist die Flugzeit in Runden. */
export interface Route {
  a: number;
  b: number;
  length: number;
}

export interface ArenaMap {
  width: number;
  height: number;
  planets: PlanetDef[];
  routes: Route[];
}

export interface Building {
  type: BuildingType;
  /** Runde der Fertigstellung. Liegt sie in der Zukunft, wird noch gebaut. */
  ready: number;
}

export interface PlanetState {
  owner: Owner;
  ships: number;
  building: Building | null;
  /** Ziel der Nachschublinie oder `null`. */
  supply: number | null;
}

/** Eine Flotte unterwegs. `progress` zählt die geflogenen Runden, bei `progress === length` kommt sie an. */
export interface Fleet {
  id: number;
  owner: Player;
  from: number;
  to: number;
  ships: number;
  progress: number;
  length: number;
  arrive: number;
  /** Nachschub aus einer Linie. */
  supply: boolean;
}

/** Eine eingereichte Aktion, so weit lesbar. Unlesbares hat `kind: "other"`. */
export interface ActionView {
  ok: boolean;
  /** Grund der Ablehnung, Kennung des Servers. */
  code: string | null;
  kind: "move" | "build" | "supply" | "other";
  /** `move`: Start. `build` und `supply`: der Planet. */
  from: number | null;
  /** `move` und `supply`: Ziel. */
  to: number | null;
  ships: number | null;
  building: BuildingType | null;
  /** `move`: die Flotte, in der die Schiffe fliegen. */
  fleet: number | null;
}

/** Kennzahlen eines Spielers nach einer Runde. */
export interface SeatRound {
  /** Kamen für diese Runde rechtzeitig Befehle? `null` in Runde 0. */
  submitted: boolean | null;
  used: number;
  limit: number;
  /** Punkte, die am Ende entscheiden. */
  score: number;
  /** Alle Schiffe, auf Planeten und unterwegs. */
  ships: number;
  planets: number;
  /** Tatsächliche Produktion je Runde. */
  production: number;
}

/** Ein Zweikampf auf einer Route. */
export interface RouteBattle {
  kind: "route";
  round: number;
  a: number;
  b: number;
  /** Abstand von `a` in Runden, in halben Schritten. 0 oder die Länge: direkt vor dem Planeten. */
  at: number;
  fleets: { id: number; owner: Player; before: number; after: number }[];
}

/** Ankunft an einem Planeten. */
export interface PlanetEvent {
  /** `reinforce`: nur eigene Schiffe kamen an. `battle`: Angriff abgewehrt. `capture`: Besitzer gewechselt. */
  kind: "reinforce" | "battle" | "capture";
  round: number;
  planet: number;
  fleets: number[];
  /** Angekommene Schiffe je Spieler, Index 0 = Spieler 1. */
  arrived: [number, number];
  before: { owner: Owner; ships: number };
  /** Stärke der Verteidigung, mit eigener Verstärkung, Festung und Heimatschutz. */
  strength: number;
  after: { owner: Owner; ships: number };
  destroyed: BuildingType | null;
}

export interface BuildEvent {
  kind: "built";
  round: number;
  planet: number;
  building: BuildingType;
}

export type GameEvent = RouteBattle | PlanetEvent | BuildEvent;

/** Was eine Seite sieht. Erst mit dem Nebel gefüllt. */
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
  /** Aktionen dieser Runde je Spieler, Index 0 = Spieler 1. */
  actions: [ActionView[], ActionView[]];
  events: GameEvent[];
  seats: [SeatRound, SeatRound];
  /** `null`: beide sehen alles. */
  visible: [Visibility, Visibility] | null;
}

export interface PlayerInfo {
  name: string;
  /** Eingebauter Bot des Servers statt eines Bots von außen. */
  builtIn: boolean;
  /** Der Platz ist besetzt. */
  joined: boolean;
  /** Hat sich zuletzt gemeldet. */
  online: boolean;
  /** Hat mehrere Fristen verpasst, der Server wartet nicht mehr auf ihn. */
  absent: boolean;
}

export type MatchStatus = "waiting" | "running" | "finished" | "aborted";

export type ResultReason = "home" | "points" | "ships" | "draw" | "aborted" | "unknown";

export interface MatchResult {
  /** `0` heißt: kein Sieger (Unentschieden oder Abbruch). */
  winner: Owner;
  reason: ResultReason;
}

/** Zahlenwerte der Regeln, soweit die Ansicht sie braucht. Stehen im Kopf jedes Matches. */
export interface Params {
  actions: { base: number; max: number };
  /** Zusätzliche Verteidiger am Heimatplaneten. */
  homeGuard: number;
  fortressFactor: number;
  shipyardFactor: number;
  scorePerBuilding: number;
  buildings: Partial<Record<BuildingType, { cost: number; time: number; hubOnly: boolean }>>;
}

export interface MatchMeta {
  id: string;
  status: MatchStatus;
  /** Kennung des Regelstands, etwa `rundenstrategie/1.0`. */
  rules: string;
  params: Params;
  /** Nach so vielen Runden endet das Match durch Wertung. */
  rounds: number;
  /** Mindestdauer einer Runde im laufenden Match, in Millisekunden. */
  roundMs: number;
  /** Frist für Befehle ab Rundenbeginn, in Millisekunden. */
  timeoutMs: number;
  players: [PlayerInfo, PlayerInfo];
  result: MatchResult | null;
  /** Serie, zu der das Match gehört, mit der Spielnummer ab 1. */
  series: { id: string; game: number } | null;
  label: string | null;
}

/** Ein Match läuft nicht mehr: beendet oder abgebrochen. */
export function isOver(status: MatchStatus): boolean {
  return status === "finished" || status === "aborted";
}

/** Anteil von Spieler 1 an der Summe beider Werte, `0.5` wenn beide null sind. */
export function share(pair: readonly [number, number]): number {
  const sum = pair[0] + pair[1];
  return sum === 0 ? 0.5 : pair[0] / sum;
}

/**
 * Stärke, mit der ein Planet verteidigt wird: Besatzung, mit fertiger Festung
 * mehr, am eigenen Heimatplaneten plus Heimatschutz.
 */
export function defenseOf(def: PlanetDef, state: PlanetState, round: number, params: Params): number {
  const fortress = state.building?.type === "fortress" && state.building.ready <= round;
  const base = fortress ? Math.floor(state.ships * params.fortressFactor) : state.ships;
  return base + (def.home !== 0 && def.home === state.owner ? params.homeGuard : 0);
}
