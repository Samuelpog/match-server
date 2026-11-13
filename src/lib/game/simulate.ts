import { runBot } from "./bots";
import { actionLimit, initialState, outcome, resolveRound, viewFor } from "./engine";
import { frameOf, initialFrame } from "./frames";
import { DEFAULTS, type BotFunction, type Frame, type GameMap, type GameResult, type GameState } from "./types";

export interface SimulateOptions {
  map: GameMap;
  bots: [BotFunction, BotFunction];
  rounds?: number;
  /** Abstand der Frames in `at`, als wäre das Match in diesem Takt gelaufen. */
  roundMs?: number;
}

export interface Simulation {
  frames: Frame[];
  result: GameResult;
  state: GameState;
}

/**
 * Spielt ein ganzes Match zwischen zwei Bot-Funktionen, ohne Server und ohne
 * Uhr. Liefert dieselben Frames, die der Server aufzeichnen würde.
 */
export function simulate(options: SimulateOptions): Simulation {
  const { map, bots } = options;
  const rounds = options.rounds ?? DEFAULTS.rounds;
  const roundMs = options.roundMs ?? 8000;
  let state = initialState(map);
  const frames: Frame[] = [initialFrame(map, state, [actionLimit(state, 0), actionLimit(state, 1)])];
  for (;;) {
    const result = outcome(map, state, rounds);
    if (result) return { frames, result, state };
    const input: [unknown, unknown] = [
      runBot(bots[0], viewFor(map, state, 0, rounds)),
      runBot(bots[1], viewFor(map, state, 1, rounds)),
    ];
    const step = resolveRound(map, state, input);
    state = step.state;
    frames.push(frameOf(map, step, [true, true], state.round * roundMs));
  }
}
