import { describe, expect, it } from "vitest";
import { actionLimit, checkActions, defenseStrength, initialState, outcome, resolveRound, seatTotals, viewFor } from "./engine";
import { PARAMS, type Action, type ArrivalEvent, type Fleet, type GameMap, type GameState, type Owner, type PlanetState, type RouteBattleEvent } from "./types";

/**
 * Kleine Testkarte:  0 ── 2 ── 3 ── 1   dazu 2 ── 4 ── 3 (Umweg).
 * Heimatplaneten 0 und 1. Route 0–2 und 1–3 haben Länge 1, 2–3 Länge 2, der Umweg je 3.
 */
function testMap(): GameMap {
  const def = (id: number, x: number, growth: number, home: 0 | 1 | null, twin: number) => ({
    id, name: `P${id}`, x, y: 70, growth, home, hub: id === 4, twin,
  });
  return {
    seed: 0,
    width: 200,
    height: 140,
    planets: [def(0, 20, 4, 0, 1), def(1, 180, 4, 1, 0), def(2, 45, 2, null, 3), def(3, 155, 2, null, 2), def(4, 100, 3, null, 4)],
    routes: [[0, 2, 1], [1, 3, 1], [2, 3, 2], [2, 4, 3], [3, 4, 3]],
    homes: [0, 1],
    hubs: [4],
    initial: [planet(0, 30), planet(1, 30), planet(null, 10), planet(null, 10), planet(null, 30)],
  };
}

function planet(owner: Owner, ships: number, extra: Partial<PlanetState> = {}): PlanetState {
  return { owner, ships, building: null, supply: null, ...extra };
}

function stateOf(planets: PlanetState[], fleets: Fleet[] = [], round = 10): GameState {
  return { round, planets, fleets, nextFleetId: 100 };
}

function fleet(id: number, owner: 0 | 1, from: number, to: number, ships: number, progress: number, length: number, round = 10): Fleet {
  return { id, owner, from, to, ships, progress, length, arrive: round + length - progress, supply: false };
}

const move = (from: number, to: number, ships: number): Action => ({ type: "move", from, to, ships });
const arrivals = (events: unknown[]) => events.filter((event): event is ArrivalEvent => (event as ArrivalEvent).step === "arrival");
const battles = (events: unknown[]) => events.filter((event): event is RouteBattleEvent => (event as RouteBattleEvent).step === "route");

describe("Aktionen", () => {
  const map = testMap();

  it("startet eine Flotte mit progress 0, sie kommt in Runde r + L an", () => {
    const start = initialState(map);
    const first = resolveRound(map, start, [[move(0, 2, 12)], []]);
    expect(first.state.round).toBe(1);
    expect(first.state.fleets).toEqual([{ id: 1, owner: 0, from: 0, to: 2, ships: 12, progress: 0, length: 1, arrive: 2, supply: false }]);
    expect(first.actions[0]).toEqual([{ action: move(0, 2, 12), ok: true, fleet: 1 }]);
    expect(first.state.planets[0].ships).toBe(30 - 12 + 4);
    expect(first.events).toEqual([]);

    const second = resolveRound(map, first.state, [[], []]);
    expect(second.state.fleets).toEqual([]);
    const [event] = arrivals(second.events);
    expect(event).toMatchObject({ kind: "battle", planet: 2, fleets: [1], arrivals: [12, 0], before: { owner: null, ships: 10 }, defense: { strength: 10 }, captured: true });
    // Der eroberte Planet produziert schon in derselben Runde für den neuen Besitzer.
    expect(second.state.planets[2]).toMatchObject({ owner: 0, ships: 2 + 2 });
  });

  it("zählt nur gültige Aktionen und lehnt nach dem Limit mit action_limit ab", () => {
    const state = stateOf([planet(0, 50), planet(1, 30), planet(0, 20), planet(null, 10), planet(null, 30)]);
    const input = [move(0, 2, 5), move(0, 1, 5), move(2, 0, 5), move(2, 3, 5), move(2, 4, 5)];
    const result = resolveRound(map, state, [input, []]);
    expect(result.actions[0].map((record) => record.code ?? "ok")).toEqual(["ok", "no_route", "ok", "ok", "action_limit"]);
    expect(result.used).toEqual([3, 0]);
    expect(result.limits).toEqual([PARAMS.actions.base, PARAMS.actions.base]);
    expect(checkActions(map, state, 0, input).map((record) => record.code ?? "ok")).toEqual(["ok", "no_route", "ok", "ok", "action_limit"]);
    expect(state.planets[0].ships).toBe(50);
  });

  it("nennt für jeden Fehler den Grund", () => {
    const state = stateOf([planet(0, 5), planet(1, 30), planet(null, 10), planet(null, 10), planet(null, 30)]);
    const codes = (input: unknown) => checkActions(map, state, 0, input).map((record) => record.code ?? "ok");
    expect(codes([null, "x", { type: "fly" }, { type: "move", from: 0 }])).toEqual(["bad_action", "bad_action", "bad_action", "bad_action"]);
    expect(codes([move(0, 9, 1), move(1, 3, 1), move(0, 2, 0), move(0, 2, 1.5), move(0, 2, 6)])).toEqual(["bad_planet", "not_owner", "bad_ships", "bad_ships", "not_enough_ships"]);
    expect(codes([{ type: "build", planet: 0, building: "fortress" }, { type: "supply", planet: 0, to: 2 }])).toEqual(["not_available", "not_available"]);
    expect(codes("unsinn")).toEqual([]);
  });

  it("zieht Schiffe der Reihe nach ab und legt zwei Züge über dieselbe Route zusammen", () => {
    const state = stateOf([planet(0, 10), planet(1, 30), planet(null, 10), planet(null, 10), planet(null, 30)]);
    const result = resolveRound(map, state, [[move(0, 2, 6), move(0, 2, 4), move(0, 2, 1)], []]);
    expect(result.actions[0].map((record) => record.code ?? "ok")).toEqual(["ok", "ok", "not_enough_ships"]);
    expect(result.actions[0][0].fleet).toBe(result.actions[0][1].fleet);
    expect(result.state.fleets).toHaveLength(1);
    expect(result.state.fleets[0].ships).toBe(10);
    expect(result.used[0]).toBe(2);
  });

  it("prüft höchstens 20 Aktionen", () => {
    const state = stateOf([planet(0, 10), planet(1, 30), planet(null, 10), planet(null, 10), planet(null, 30)]);
    expect(checkActions(map, state, 0, Array.from({ length: 30 }, () => move(0, 2, 1)))).toHaveLength(20);
  });

  it("gibt je fertiger Kommandozentrale eine Aktion mehr, höchstens 5", () => {
    const command = (ready: number) => ({ building: { type: "command" as const, ready } });
    const state = stateOf([planet(0, 5, command(5)), planet(1, 30), planet(0, 5, command(9)), planet(0, 5, command(11)), planet(0, 5, command(12))]);
    expect(actionLimit(state, 0)).toBe(5);
    expect(actionLimit(state, 1)).toBe(3);
    state.planets[2].owner = 1;
    expect(actionLimit(state, 0)).toBe(4);
  });
});

describe("Kampf auf der Route", () => {
  const map = testMap();
  const base = () => [planet(0, 30), planet(1, 30), planet(0, 10), planet(1, 10), planet(null, 30)];

  it("lässt entgegenkommende Flotten kämpfen, die größere überlebt mit der Differenz", () => {
    // Länge 2, beide schon eine Runde unterwegs: Sie stehen beide bei 1 und treffen sich nicht. Nächste Runde kämen sie vorbei.
    const state = stateOf(base(), [fleet(1, 0, 2, 3, 12, 0, 2), fleet(2, 1, 3, 2, 7, 0, 2)]);
    const result = resolveRound(map, state, [[], []]);
    const [battle] = battles(result.events);
    expect(battle).toEqual({
      step: "route", kind: "battle", route: [2, 3], at: 1,
      fleets: [{ id: 1, owner: 0, before: 12, after: 5 }, { id: 2, owner: 1, before: 7, after: 0 }],
    });
    expect(result.state.fleets).toEqual([{ ...fleet(1, 0, 2, 3, 5, 1, 2), arrive: 12 }]);
  });

  it("gibt den Ort in halben Runden an, wenn die Flotten aneinander vorbeikämen", () => {
    const one = stateOf([planet(0, 30), planet(1, 30), planet(1, 10), planet(1, 10), planet(null, 30)], [fleet(1, 0, 0, 2, 9, 0, 1), fleet(2, 1, 2, 0, 9, 0, 1)]);
    const result = resolveRound(map, one, [[], []]);
    expect(battles(result.events)[0]).toMatchObject({ route: [0, 2], at: 0.5 });
    // Gleichstand: beide vernichtet.
    expect(result.state.fleets).toEqual([]);
    expect(arrivals(result.events)).toEqual([]);
  });

  it("wertet den Ausfall direkt vor dem Planeten, ohne Heimatschutz", () => {
    // Eine fremde Flotte kommt am Heimatplaneten 0 an, der Besitzer schickt ihr in derselben Runde 20 entgegen.
    const state = stateOf([planet(0, 30), planet(1, 30), planet(1, 10), planet(1, 10), planet(null, 30)], [fleet(1, 1, 2, 0, 25, 0, 1)]);
    const result = resolveRound(map, state, [[move(0, 2, 20)], []]);
    expect(battles(result.events)[0]).toMatchObject({ route: [0, 2], at: 0, fleets: [{ id: 100, before: 20, after: 0 }, { id: 1, before: 25, after: 5 }] });
    // Die restlichen 5 greifen den Planeten an: 10 Besatzung plus 15 Heimatschutz halten.
    expect(arrivals(result.events)[0]).toMatchObject({ planet: 0, kind: "battle", defense: { strength: 25 }, after: { owner: 0, ships: 10 }, captured: false });
  });

  it("lässt eigene Flotten und Flotten in gleicher Richtung aneinander vorbei", () => {
    const own = stateOf(base(), [fleet(1, 0, 2, 3, 5, 0, 2), fleet(2, 0, 3, 2, 5, 0, 2)]);
    expect(battles(resolveRound(map, own, [[], []]).events)).toEqual([]);
    const sameWay = stateOf(base(), [fleet(1, 0, 2, 3, 5, 0, 2), fleet(3, 1, 2, 3, 4, 1, 2)]);
    expect(battles(resolveRound(map, sameWay, [[], []]).events)).toEqual([]);
  });

  it("lässt den Sieger in derselben Runde auf die nächste Flotte treffen", () => {
    const state = stateOf(base(), [fleet(1, 0, 2, 4, 20, 1, 3), fleet(2, 1, 4, 2, 6, 1, 3), fleet(3, 1, 4, 2, 5, 0, 3)]);
    const result = resolveRound(map, state, [[], []]);
    expect(battles(result.events).map((event) => event.fleets.map((entry) => `${entry.id}:${entry.after}`))).toEqual([["1:14", "2:0"], ["1:9", "3:0"]]);
  });
});

describe("Kampf am Planeten", () => {
  const map = testMap();

  it("verstärkt den eigenen Planeten", () => {
    const state = stateOf([planet(0, 30), planet(1, 30), planet(0, 3), planet(null, 10), planet(null, 30)], [fleet(1, 0, 0, 2, 8, 0, 1)]);
    const result = resolveRound(map, state, [[], []]);
    expect(arrivals(result.events)[0]).toMatchObject({ kind: "reinforce", before: { owner: 0, ships: 3 }, after: { owner: 0, ships: 11 }, captured: false, destroyed: null });
    expect(result.state.planets[2].ships).toBe(13);
  });

  it("lässt den Besitzer bei Gleichstand mit 0 Schiffen stehen", () => {
    const state = stateOf([planet(0, 30), planet(1, 30), planet(null, 8), planet(null, 10), planet(null, 30)], [fleet(1, 0, 0, 2, 8, 0, 1)]);
    const result = resolveRound(map, state, [[], []]);
    expect(result.state.planets[2]).toMatchObject({ owner: null, ships: 0 });
  });

  it("rechnet drei Parteien ab: die stärkste behält die Differenz zur zweitstärksten", () => {
    const state = stateOf([planet(0, 30), planet(1, 30), planet(0, 5), planet(1, 5), planet(null, 10)], [fleet(1, 0, 2, 4, 25, 2, 3), fleet(2, 1, 3, 4, 18, 2, 3)]);
    const result = resolveRound(map, state, [[], []]);
    expect(arrivals(result.events)[0]).toMatchObject({ planet: 4, arrivals: [25, 18], after: { owner: 0, ships: 7 }, captured: true });
  });

  it("zählt am Heimatplaneten den Heimatschutz mit, er fängt zuerst ab", () => {
    const state = stateOf([planet(0, 20), planet(1, 30), planet(1, 5), planet(null, 10), planet(null, 30)], [fleet(1, 1, 2, 0, 30, 0, 1)]);
    const result = resolveRound(map, state, [[], []]);
    expect(arrivals(result.events)[0]).toMatchObject({ defense: { strength: 35 }, after: { owner: 0, ships: 5 }, captured: false });
    expect(outcome(map, result.state, 120)).toBeNull();
  });

  it("rechnet die Festung wie im Beispiel aus a-0004: 20 Schiffe, Festung, Angriff mit 35, es bleiben 6", () => {
    const fortress = { building: { type: "fortress" as const, ready: 5 } };
    const state = stateOf([planet(0, 20, fortress), planet(1, 30), planet(1, 5), planet(null, 10), planet(null, 30)], [fleet(1, 1, 2, 0, 35, 0, 1)]);
    expect(defenseStrength(map, state.planets[0], 0, 11)).toBe(45);
    const result = resolveRound(map, state, [[], []]);
    expect(arrivals(result.events)[0]).toMatchObject({ defense: { strength: 45 }, after: { owner: 0, ships: 6 } });
  });

  it("zerstört bei der Eroberung Ausbau und Nachschublinie", () => {
    const state = stateOf(
      [planet(0, 30), planet(1, 30), planet(1, 5, { building: { type: "shipyard", ready: 20 }, supply: 3 }), planet(1, 10), planet(null, 30)],
      [fleet(1, 0, 0, 2, 9, 0, 1)],
    );
    const result = resolveRound(map, state, [[], []]);
    expect(arrivals(result.events)[0]).toMatchObject({ captured: true, destroyed: "shipyard" });
    expect(result.state.planets[2]).toMatchObject({ owner: 0, building: null, supply: null });
  });
});

describe("Sieg und Punkte", () => {
  const map = testMap();

  it("beendet das Spiel sofort, wenn ein Heimatplanet fällt", () => {
    const state = stateOf([planet(0, 5), planet(1, 30), planet(1, 5), planet(null, 10), planet(null, 30)], [fleet(1, 1, 2, 0, 40, 0, 1)]);
    const result = resolveRound(map, state, [[], []]);
    expect(result.state.planets[0].owner).toBe(1);
    expect(outcome(map, result.state, 120)).toEqual({ winner: 1, reason: "home" });
  });

  it("wertet nach Punkten, wenn beide Heimatplaneten in derselben Runde fallen", () => {
    const state = stateOf([planet(1, 5), planet(0, 5), planet(0, 5), planet(null, 10), planet(null, 30)]);
    expect(outcome(map, state, 120)).toEqual({ winner: 0, reason: "points" });
  });

  it("wertet nach der letzten Runde nach Punkten, dann nach Schiffen", () => {
    const even = [planet(0, 30), planet(1, 30), planet(0, 5), planet(1, 5), planet(null, 30)];
    expect(outcome(map, stateOf(even, [], 119), 120)).toBeNull();
    expect(outcome(map, stateOf(even, [], 120), 120)).toEqual({ winner: null, reason: "draw" });
    expect(outcome(map, stateOf(even, [fleet(1, 1, 3, 2, 1, 0, 2)], 120), 120)).toEqual({ winner: 1, reason: "ships" });
    const ahead = [planet(0, 1), planet(1, 90), planet(0, 1), planet(null, 5), planet(0, 1)];
    expect(outcome(map, stateOf(ahead, [], 120), 120)).toEqual({ winner: 0, reason: "points" });
  });

  it("zählt Punkte aus Wachstum und fertigen Ausbauten", () => {
    const state = stateOf([planet(0, 10, { building: { type: "fortress", ready: 10 } }), planet(1, 10, { building: { type: "fortress", ready: 11 } }), planet(0, 1), planet(null, 5), planet(null, 1)]);
    const [a, b] = seatTotals(map, state);
    expect(a).toMatchObject({ score: 4 + 2 + PARAMS.scorePerBuilding, growth: 6, planets: 2, ships: 11 });
    expect(b.score).toBe(4);
  });

  it("zeigt dem Bot den Stand der nächsten Runde", () => {
    const view = viewFor(map, initialState(map), 1, 120);
    expect(view).toMatchObject({ you: 1, round: 1, rounds: 120, actions: { limit: 3 }, score: [4, 4] });
    expect(view.planets[0]).toMatchObject({ id: 0, name: "P0", home: 0, owner: 0, ships: 30, growth: 4 });
    expect(view.routes).toBe(map.routes);
  });
});

describe("Symmetrie", () => {
  it("hält den Zustand gespiegelt, wenn beide gespiegelt spielen", () => {
    const map = testMap();
    let state = initialState(map);
    const twin = (id: number) => map.planets[id].twin;
    const script: Action[][] = [[move(0, 2, 15)], [], [move(2, 3, 4), move(0, 2, 10)], [move(2, 4, 3)], [], [], [move(2, 3, 5)]];
    for (const actions of script) {
      const mirrored = actions.map((action) => (action.type === "move" ? move(twin(action.from), twin(action.to), action.ships) : action));
      state = resolveRound(map, state, [actions, mirrored]).state;
      state.planets.forEach((entry, id) => {
        const other = state.planets[twin(id)];
        expect(other.ships).toBe(entry.ships);
        expect(other.owner).toBe(entry.owner === null ? null : 1 - entry.owner);
      });
    }
  });
});
