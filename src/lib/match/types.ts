/** Sitzplatz im Match, bei null beginnend. */
export type Seat = number;

export interface GameResult {
  /** Sitzplatz des Gewinners, `null` bei Unentschieden. */
  winner: Seat | null;
  reason?: string;
}

/**
 * Die Schnittstelle, hinter der ein Spiel steckt. Der Match-Server kennt nur
 * diese Funktionen und weiß nichts über Regeln, Brett oder Züge.
 *
 * Alle Funktionen müssen rein sein: gleiche Eingabe, gleiche Ausgabe, kein
 * Zugriff auf Uhr, Netz oder Zufall außerhalb von `init`.
 */
export interface GameModule<S = unknown, M = unknown> {
  id: string;
  name: string;
  /** Anzahl der Sitzplätze. Das Match startet, sobald alle besetzt sind. */
  seats: number;
  /** Startzustand, wird einmal beim Start des Matches aufgerufen. */
  init(): S;
  /** Wer ist am Zug? `null` heißt: jeder Sitzplatz darf ziehen. */
  turn(state: S): Seat | null;
  /**
   * Wendet einen Zug an und gibt den neuen Zustand zurück. Ungültige Züge
   * werfen `InvalidMoveError`. `event` ist die öffentliche Beschreibung des
   * Zugs für den Verlauf; sie darf nichts Verdecktes enthalten.
   */
  applyMove(state: S, seat: Seat, move: M): { state: S; event?: unknown };
  /** `null`, solange das Spiel läuft. */
  result(state: S): GameResult | null;
  /** Was Zuschauer sehen dürfen. */
  publicView(state: S): unknown;
  /** Was der Spieler auf diesem Sitzplatz sehen darf. */
  playerView(state: S, seat: Seat): unknown;
}

export class InvalidMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoveError";
  }
}

export type MatchStatus = "waiting" | "running" | "finished";

export interface SeatRecord {
  name: string;
  /** SHA-256 des Spieler-Tokens. Das Token selbst wird nie gespeichert. */
  tokenHash: string;
  joinedAt: number;
}

export interface MoveRecord {
  n: number;
  seat: Seat;
  at: number;
  /** Vom Client vergebene Kennung, damit ein wiederholter Aufruf nicht doppelt zieht. */
  moveId?: string;
  event: unknown;
}

export interface MatchRecord {
  id: string;
  game: string;
  status: MatchStatus;
  /** Steigt bei jeder Änderung um eins. Grundlage für `since` und für sicheres Speichern. */
  version: number;
  createdAt: number;
  updatedAt: number;
  seats: (SeatRecord | null)[];
  state: unknown;
  moves: MoveRecord[];
  result: GameResult | null;
}

export interface SeatView {
  seat: Seat;
  name: string | null;
  joined: boolean;
  online: boolean;
  lastSeenAt: number | null;
}

export interface MatchView {
  id: string;
  game: { id: string; name: string };
  status: MatchStatus;
  version: number;
  turn: Seat | null;
  seats: SeatView[];
  moveCount: number;
  log: Omit<MoveRecord, "moveId">[];
  result: GameResult | null;
  view: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface PlayerMatchView extends MatchView {
  you: { seat: Seat; yourTurn: boolean };
}
