import { seatTotals, type RoundResult } from "./engine";
import type { Frame, GameMap, GameState, SeatFrame } from "./types";

function seats(map: GameMap, state: GameState, submitted: [boolean, boolean], used: [number, number], limits: [number, number]): [SeatFrame, SeatFrame] {
  const totals = seatTotals(map, state);
  return [0, 1].map((seat) => ({
    submitted: submitted[seat],
    actions: { used: used[seat], limit: limits[seat] },
    score: totals[seat].score,
    ships: totals[seat].ships,
    planets: totals[seat].planets,
    growth: totals[seat].growth,
    production: totals[seat].production,
  })) as [SeatFrame, SeatFrame];
}

function snapshot(state: GameState): Pick<Frame, "planets" | "fleets"> {
  return {
    planets: state.planets.map((planet) => ({ ...planet, building: planet.building ? { ...planet.building } : null })),
    fleets: state.fleets.map((fleet) => ({ ...fleet })),
  };
}

/** Frame 0: der Start. */
export function initialFrame(map: GameMap, state: GameState, limits: [number, number]): Frame {
  return {
    round: 0,
    at: 0,
    ...snapshot(state),
    actions: [[], []],
    events: [],
    players: seats(map, state, [false, false], [0, 0], limits),
    visible: null,
  };
}

/** Frame nach einer aufgelösten Runde. `at` sind Millisekunden seit Match-Start. */
export function frameOf(map: GameMap, result: RoundResult, submitted: [boolean, boolean], at: number): Frame {
  return {
    round: result.state.round,
    at,
    ...snapshot(result.state),
    actions: result.actions,
    events: result.events,
    players: seats(map, result.state, submitted, result.used, result.limits),
    visible: null,
  };
}
