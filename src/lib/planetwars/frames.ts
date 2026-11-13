import { seatTotals, type TickResult } from "./engine";
import type { Frame, GameMap, GameState, SeatFrame } from "./types";

function seatFrames(
  map: GameMap,
  state: GameState,
  submitted: [boolean, boolean],
  accepted: [number, number],
  rejected: [number, number],
): [SeatFrame, SeatFrame] {
  const totals = seatTotals(map, state);
  const seat = (index: 0 | 1): SeatFrame => ({
    submitted: submitted[index],
    accepted: accepted[index],
    rejected: rejected[index],
    ships: totals[index].ships,
    growth: totals[index].growth,
    planets: totals[index].planets,
  });
  return [seat(0), seat(1)];
}

/** Frame 0: der Startzustand, bevor irgendetwas geschehen ist. */
export function initialFrame(map: GameMap, state: GameState): Frame {
  return {
    t: state.tick,
    at: 0,
    planets: state.planets.map(([owner, ships]) => [owner, ships]),
    launches: [],
    events: [],
    players: seatFrames(map, state, [false, false], [0, 0], [0, 0]),
  };
}

/**
 * Baut den Frame zu einem aufgelösten Tick. `submitted` sagt je Sitz, ob
 * rechtzeitig Befehle kamen, `at` sind die Millisekunden seit Match-Start.
 */
export function frameOf(map: GameMap, result: TickResult, submitted: [boolean, boolean], at: number): Frame {
  return {
    t: result.state.tick,
    at,
    planets: result.state.planets.map(([owner, ships]) => [owner, ships]),
    launches: result.launches,
    events: result.events,
    players: seatFrames(map, result.state, submitted, result.accepted, [
      result.rejected[0].length,
      result.rejected[1].length,
    ]),
  };
}

/** Alle Flotten, die zu Tick `t` unterwegs sind, aus den Frames bis `t` zusammengesetzt. */
export function fleetsAt(frames: Frame[], t: number) {
  return frames.filter((frame) => frame.t <= t).flatMap((frame) => frame.launches.filter((fleet) => fleet.arrive > t));
}
