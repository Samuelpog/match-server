import { runBot } from "./bots";
import { initialState, outcome, resolveTick } from "./engine";
import { frameOf, initialFrame } from "./frames";
import { DEFAULTS, type BotFunction, type Frame, type GameMap, type GameResult, type GameState } from "./types";

export interface SimulateOptions {
  map: GameMap;
  bots: [BotFunction, BotFunction];
  tickLimit?: number;
  /** Abstand der Frames in `at`, als wäre das Match in diesem Takt gelaufen. */
  tickMs?: number;
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
  const tickLimit = options.tickLimit ?? DEFAULTS.tickLimit;
  const tickMs = options.tickMs ?? 300;
  let state = initialState(map);
  const frames: Frame[] = [initialFrame(map, state)];
  for (;;) {
    const result = outcome(map, state, tickLimit);
    if (result) return { frames, result, state };
    const orders: [unknown, unknown] = [
      runBot(bots[0], { map, state, you: 0, tickLimit }),
      runBot(bots[1], { map, state, you: 1, tickLimit }),
    ];
    const step = resolveTick(map, state, orders);
    state = step.state;
    frames.push(frameOf(map, step, [true, true], state.tick * tickMs));
  }
}
