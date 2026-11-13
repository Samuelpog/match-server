/**
 * Formen aller JSON-Antworten und Anfragen der HTTP-Schnittstelle.
 * Nur Typen: darf auch vom Browser-Code importiert werden.
 */
import type { Fleet, Frame, GameMap, GameResult, Order, Owner, RejectedOrder, Seat } from "@/lib/planetwars/types";

export type MatchStatus = "waiting" | "running" | "finished" | "aborted";

/** Einstellungen eines Matches. Alle Felder sind beim Anlegen optional. */
export interface MatchOptions {
  /** Karten-Seed, ganze Zahl von 0 bis 4294967295. Gleicher Seed, gleiche Karte. */
  seed: number;
  /** Anzahl der Planeten, 20 bis 30. */
  planets: number;
  /** Nach so vielen Ticks endet das Match durch Wertung. */
  tickLimit: number;
  /** Mindestdauer eines Ticks in Millisekunden. Taktet Matches zwischen schnellen Bots. */
  tickMs: number;
  /** Frist je Tick in Millisekunden. Wer bis dahin nichts einreicht, setzt aus. */
  timeoutMs: number;
}

/** Wer auf einem Sitz spielt, beim Anlegen. */
export type PlayerSpec =
  /** Eingebauter Bot, rechnet im Server. `bot` ist eine Kennung aus `GET /api/health`. */
  | { type: "bot"; bot: string }
  /** Offener Platz, den ein externer Bot über `join` besetzt. */
  | { type: "open"; name?: string };

export interface PlayerInfo {
  seat: Seat;
  name: string | null;
  kind: "bot" | "external";
  /** Kennung des eingebauten Bots, sonst `null`. */
  bot: string | null;
  joined: boolean;
  /** Externer Bot hat sich in den letzten 30 Sekunden gemeldet. Eingebaute Bots sind immer online. */
  online: boolean;
  /** Hat zuletzt mehrere Fristen verpasst, auf ihn wird nicht mehr gewartet. */
  absent: boolean;
}

export interface MatchInfo {
  id: string;
  status: MatchStatus;
  /**
   * Steigt bei jeder Änderung am Match: Beitritt, Start, jeder Tick, Wechsel
   * von `online` oder `absent`, Ende. Grundlage für `since` beim Warten.
   */
  version: number;
  /** Zuletzt aufgelöster Tick. 0, solange noch nichts gespielt ist. */
  tick: number;
  tickLimit: number;
  tickMs: number;
  timeoutMs: number;
  seed: number;
  players: [PlayerInfo, PlayerInfo];
  result: GameResult | null;
  /** Gehört das Match zu einer Serie: deren Kennung und die Spielnummer ab 1. */
  series: { id: string; game: number } | null;
  label: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/**
 * Antwort von `GET /api/matches/{id}/replay`. Mit `from=0` ist das zugleich
 * die Replay-Datei: so speichern, später wieder laden.
 */
export interface ReplayResponse {
  format: "planetwars-replay";
  version: 1;
  match: MatchInfo;
  map: GameMap;
  /** Frames ab dem angefragten Tick, lückenlos und aufsteigend. */
  frames: Frame[];
  /** Wert für `from` beim nächsten Aufruf. */
  next: number;
}

export interface MatchResponse {
  match: MatchInfo;
  map: GameMap;
  /** Fertiger Auftragstext für einen Bot, der diesem Match beitreten soll. */
  briefing: string;
}

export interface MatchListResponse {
  matches: MatchInfo[];
}

export interface CreateMatchRequest {
  players?: [PlayerSpec, PlayerSpec];
  /** Kurzform: beide Sitze mit eingebauten Bots besetzen und sofort starten. */
  demo?: boolean;
  options?: Partial<MatchOptions>;
  label?: string;
}

export interface JoinResponse {
  seat: Seat;
  /** Geheimes Spieler-Token. Gehört in `Authorization: Bearer <token>`. */
  token: string;
  match: MatchInfo;
  map: GameMap;
}

/** Ein Planet aus Sicht eines Bots: feste und veränderliche Eigenschaften zusammen. */
export interface PlanetView {
  id: number;
  x: number;
  y: number;
  growth: number;
  owner: Owner;
  ships: number;
}

/** Antwort von `GET /api/matches/{id}/state`: alles, was ein Bot für einen Zug braucht. */
export interface PlayerState {
  match: MatchInfo;
  /** Dein Sitz. Planeten und Flotten mit `owner === you` gehören dir. */
  you: Seat;
  /** Tick, den dieser Stand beschreibt. Befehle dazu mit genau dieser Nummer einreichen. */
  tick: number;
  /** Millisekunden bis zur Frist dieses Ticks. `null`, wenn das Match nicht läuft. */
  deadlineMs: number | null;
  /** Hast du für diesen Tick schon eingereicht? */
  submitted: boolean;
  speed: number;
  planets: PlanetView[];
  /** Alle Flotten im Flug, eigene und gegnerische. */
  fleets: Fleet[];
}

export interface OrdersRequest {
  /** Der Tick, auf dessen Stand sich die Befehle beziehen (`PlayerState.tick`). */
  tick: number;
  orders: Order[];
}

export interface OrdersResponse {
  tick: number;
  accepted: number;
  rejected: RejectedOrder[];
  /** Nur mit `?wait=`: der Stand nach Auflösung des Ticks, sonst `null`. */
  state: PlayerState | null;
}

export type SeriesStatus = "waiting" | "running" | "finished" | "aborted";

/** Teilnehmer einer Serie. `slot` bleibt über die Serie gleich, der Sitz wechselt je Spiel. */
export interface SeriesPlayer {
  slot: 0 | 1;
  name: string | null;
  kind: "bot" | "external";
  bot: string | null;
  joined: boolean;
  online: boolean;
}

export interface SeriesGame {
  /** Spielnummer ab 1. */
  game: number;
  matchId: string;
  /** Welcher Teilnehmer auf welchem Sitz saß: `seats[sitz] = slot`. */
  seats: [0 | 1, 0 | 1];
  status: MatchStatus;
  /** Gewinner als `slot`, `null` bei Unentschieden, Abbruch oder laufendem Spiel. */
  winner: 0 | 1 | null;
  result: GameResult | null;
}

export interface SeriesInfo {
  id: string;
  status: SeriesStatus;
  /** Steigt bei jeder Änderung. Grundlage für `since` beim Warten. */
  version: number;
  bestOf: 1 | 3 | 5;
  players: [SeriesPlayer, SeriesPlayer];
  /** Siege je Teilnehmer. */
  wins: [number, number];
  draws: number;
  games: SeriesGame[];
  /** Kennung des laufenden Matches, sonst `null`. */
  current: string | null;
  /** Gewinner der Serie als `slot`, `null` bei Gleichstand oder solange sie läuft. */
  winner: 0 | 1 | null;
  options: MatchOptions;
  label: string | null;
  createdAt: number;
}

export interface CreateSeriesRequest {
  bestOf?: 1 | 3 | 5;
  players?: [PlayerSpec, PlayerSpec];
  demo?: boolean;
  /** `seed` gilt für Spiel 1, jedes weitere Spiel nimmt `seed + Spielnummer - 1`. */
  options?: Partial<MatchOptions>;
  label?: string;
}

export interface SeriesResponse {
  series: SeriesInfo;
  /** Fertiger Auftragstext für einen Bot, der dieser Serie beitreten soll. */
  briefing: string;
}

export interface SeriesListResponse {
  series: SeriesInfo[];
}

export interface SeriesJoinResponse {
  slot: 0 | 1;
  /** Gilt für die ganze Serie und für jedes ihrer Matches. */
  token: string;
  series: SeriesInfo;
}

/** Antwort von `GET /api/series/{id}/me`. */
export interface SeriesPlayerState {
  series: SeriesInfo;
  you: 0 | 1;
  /** Das Match, in dem du jetzt spielen sollst, mit deinem Sitz darin. */
  current: { matchId: string; seat: Seat } | null;
}

export interface BuiltinBotInfo {
  id: string;
  name: string;
  description: string;
}

export interface HealthResponse {
  ok: true;
  /** Commit, aus dem der Server gebaut wurde, soweit bekannt. */
  commit: string | null;
  /** Ändert sich bei jedem Prozessstart. Ändert sie sich, sind alle Matches weg. */
  bootId: string;
  startedAt: number;
  arenaKeyRequired: boolean;
  bots: BuiltinBotInfo[];
  defaults: MatchOptions;
  limits: {
    planets: [number, number];
    tickLimit: [number, number];
    tickMs: [number, number];
    timeoutMs: [number, number];
    maxWaitSeconds: number;
    maxRunningMatches: number;
  };
  running: number;
}

export interface ErrorResponse {
  error: { code: string; message: string };
}
