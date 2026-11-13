import { InvalidMoveError, type GameModule } from "@/lib/match/types";

/**
 * Platzhalter, bis das richtige Spiel eingehängt wird. Zwei Spieler ziehen
 * abwechselnd, jeder Zug ist ein beliebiges JSON-Objekt und landet unverändert
 * im Verlauf. `{ "aufgeben": true }` beendet das Match.
 *
 * Ersetzen: neue Datei neben dieser anlegen, `GameModule` umsetzen und in
 * `src/lib/games/index.ts` eintragen.
 */
interface State {
  turn: number;
  count: number;
  winner: number | null;
  over: boolean;
}

type Move = Record<string, unknown>;

export const placeholder: GameModule<State, Move> = {
  id: "platzhalter",
  name: "Platzhalter",
  seats: 2,
  init: () => ({ turn: 0, count: 0, winner: null, over: false }),
  turn: (state) => (state.over ? null : state.turn),
  applyMove(state, seat, move) {
    if (move === null || typeof move !== "object" || Array.isArray(move)) {
      throw new InvalidMoveError("Ein Zug muss ein JSON-Objekt sein.");
    }
    if (move.aufgeben === true) {
      return {
        state: { ...state, over: true, winner: 1 - seat },
        event: { aufgeben: true },
      };
    }
    return {
      state: { ...state, turn: 1 - seat, count: state.count + 1 },
      event: move,
    };
  },
  result: (state) => (state.over ? { winner: state.winner, reason: "aufgegeben" } : null),
  publicView: (state) => ({ zuege: state.count }),
  playerView: (state) => ({ zuege: state.count }),
};
