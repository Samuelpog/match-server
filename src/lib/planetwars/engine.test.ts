import { describe, expect, it } from "vitest";
import { initialState, outcome, resolveTick, seatTotals, travelTicks } from "./engine";
import { generateMap, twinOf } from "./mapgen";
import { mulberry32 } from "./rng";
import type { GameMap, GameState, Order, PlanetState } from "./types";

/**
 * Kleine Handkarte auf einer Linie, speed 10:
 * 0 (Sitz 0) bei x=10, 1 (Sitz 1) bei x=110, 2 neutral bei x=30, 3 neutral bei x=90, 4 neutral bei x=60.
 */
function lineMap(initial?: PlanetState[]): GameMap {
  return {
    seed: 0,
    width: 120,
    height: 20,
    speed: 10,
    planets: [
      { id: 0, x: 10, y: 10, growth: 5 },
      { id: 1, x: 110, y: 10, growth: 5 },
      { id: 2, x: 30, y: 10, growth: 2 },
      { id: 3, x: 90, y: 10, growth: 2 },
      { id: 4, x: 60, y: 10, growth: 3 },
    ],
    homes: [0, 1],
    initial: initial ?? [
      [0, 100],
      [1, 100],
      [null, 10],
      [null, 10],
      [null, 20],
    ],
  };
}

const none: [Order[], Order[]] = [[], []];

function run(map: GameMap, state: GameState, ticks: number): GameState {
  let current = state;
  for (let i = 0; i < ticks; i++) current = resolveTick(map, current, none).state;
  return current;
}

describe("Flugzeit", () => {
  it("ist der aufgerundete Abstand geteilt durch die Geschwindigkeit, mindestens 1", () => {
    const map = lineMap();
    expect(travelTicks(map, 0, 2)).toBe(2);
    expect(travelTicks(map, 0, 4)).toBe(5);
    expect(travelTicks(map, 0, 1)).toBe(10);
    expect(travelTicks(map, 1, 0)).toBe(10);
    const near = lineMap();
    near.planets[2] = { id: 2, x: 13, y: 10, growth: 2 };
    expect(travelTicks(near, 0, 2)).toBe(1);
    near.planets[2] = { id: 2, x: 21, y: 10, growth: 2 };
    expect(travelTicks(near, 0, 2)).toBe(2);
  });
});

describe("Befehle", () => {
  it("ziehen Schiffe ab und erzeugen eine Flotte mit Start- und Ankunfts-Tick", () => {
    const map = lineMap();
    const result = resolveTick(map, initialState(map), [[{ from: 0, to: 2, ships: 30 }], []]);
    expect(result.state.tick).toBe(1);
    // 100 - 30 + 5 Produktion
    expect(result.state.planets[0]).toEqual([0, 75]);
    expect(result.launches).toEqual([{ id: 1, owner: 0, from: 0, to: 2, ships: 30, depart: 0, arrive: 2 }]);
    expect(result.state.fleets).toEqual(result.launches);
    expect(result.accepted).toEqual([1, 0]);
    expect(result.rejected).toEqual([[], []]);
  });

  it("werden einzeln abgelehnt, gültige gelten trotzdem", () => {
    const map = lineMap();
    const orders = [
      { from: 0, to: 2, ships: 10 }, // gültig
      { from: 1, to: 2, ships: 10 }, // fremder Planet
      { from: 0, to: 0, ships: 10 }, // gleiches Ziel
      { from: 0, to: 9, ships: 10 }, // unbekannt
      { from: 0, to: 2, ships: 0 }, // keine Schiffe
      { from: 0, to: 2, ships: 2.5 }, // keine ganze Zahl
      { from: 0, to: 2, ships: 91 }, // mehr als übrig (90)
      { from: 0, to: 4, ships: 90 }, // genau der Rest
      { from: 0, to: 4, ships: 1 }, // nichts mehr da
      "unsinn",
      null,
    ] as unknown as Order[];
    const result = resolveTick(map, initialState(map), [orders, []]);
    expect(result.accepted[0]).toBe(2);
    expect(result.rejected[0].map(({ index, code }) => [index, code])).toEqual([
      [1, "not_owner"],
      [2, "same_planet"],
      [3, "unknown_planet"],
      [4, "bad_ship_count"],
      [5, "bad_ship_count"],
      [6, "not_enough_ships"],
      [8, "not_enough_ships"],
      [9, "malformed"],
      [10, "malformed"],
    ]);
    expect(result.state.planets[0]).toEqual([0, 5]);
  });

  it("verkraften alles, was kein Array ist", () => {
    const map = lineMap();
    const result = resolveTick(map, initialState(map), [{ from: 0 } as unknown as Order[], undefined as unknown as Order[]]);
    expect(result.accepted).toEqual([0, 0]);
    expect(result.state.planets[0]).toEqual([0, 105]);
  });

  it("nehmen höchstens 200 Befehle je Tick an", () => {
    const map = lineMap();
    const orders = Array.from({ length: 205 }, () => ({ from: 0, to: 2, ships: 0 }));
    const result = resolveTick(map, initialState(map), [orders, []]);
    expect(result.rejected[0]).toHaveLength(205);
    expect(result.rejected[0][204].code).toBe("too_many_orders");
  });

  it("fassen Flotten mit gleichem Start und Ziel zusammen", () => {
    const map = lineMap();
    const result = resolveTick(map, initialState(map), [
      [
        { from: 0, to: 2, ships: 10 },
        { from: 0, to: 2, ships: 15 },
      ],
      [],
    ]);
    expect(result.launches).toHaveLength(1);
    expect(result.launches[0].ships).toBe(25);
    expect(result.accepted[0]).toBe(2);
  });

  it("verändern den übergebenen Zustand nicht", () => {
    const map = lineMap();
    const state = initialState(map);
    const copy = structuredClone(state);
    resolveTick(map, state, [[{ from: 0, to: 2, ships: 30 }], [{ from: 1, to: 3, ships: 30 }]]);
    expect(state).toEqual(copy);
  });
});

describe("Produktion", () => {
  it("gibt es nur auf Planeten, die einem Spieler gehören", () => {
    const map = lineMap();
    const state = run(map, initialState(map), 3);
    expect(state.planets).toEqual([
      [0, 115],
      [1, 115],
      [null, 10],
      [null, 10],
      [null, 20],
    ]);
  });
});

describe("Ankunft und Kampf", () => {
  it("verstärkt einen eigenen Planeten", () => {
    const map = lineMap([
      [0, 100],
      [1, 100],
      [0, 10],
      [null, 10],
      [null, 20],
    ]);
    let step = resolveTick(map, initialState(map), [[{ from: 0, to: 2, ships: 40 }], []]);
    expect(step.events).toEqual([]);
    step = resolveTick(map, step.state, none);
    // 10 + 2 + 2 Produktion + 40
    expect(step.state.planets[2]).toEqual([0, 54]);
    expect(step.events).toEqual([
      { planet: 2, arrivals: [40, 0], before: [0, 14], after: [0, 54], captured: false },
    ]);
    expect(step.state.fleets).toEqual([]);
  });

  it("erobert einen neutralen Planeten nur mit mehr Schiffen als die Garnison", () => {
    const map = lineMap();
    let step = resolveTick(map, initialState(map), [
      [{ from: 0, to: 2, ships: 11 }],
      [{ from: 1, to: 3, ships: 10 }],
    ]);
    step = resolveTick(map, step.state, none);
    expect(step.state.planets[2]).toEqual([0, 1]);
    // Gleichstand: bleibt neutral, mit 0 Schiffen
    expect(step.state.planets[3]).toEqual([null, 0]);
    expect(step.events).toEqual([
      { planet: 2, arrivals: [11, 0], before: [null, 10], after: [0, 1], captured: true },
      { planet: 3, arrivals: [0, 10], before: [null, 10], after: [null, 0], captured: false },
    ]);
  });

  it("rechnet die Produktion des Verteidigers vor dem Kampf an", () => {
    const map = lineMap([
      [0, 100],
      [1, 100],
      [1, 10],
      [null, 10],
      [null, 20],
    ]);
    let step = resolveTick(map, initialState(map), [[{ from: 0, to: 2, ships: 14 }], []]);
    step = resolveTick(map, step.state, none);
    // Garnison 10 + 2 Ticks je 2 = 14, Angriff 14: Gleichstand
    expect(step.state.planets[2]).toEqual([1, 0]);
    expect(step.events[0]).toEqual({ planet: 2, arrivals: [14, 0], before: [1, 14], after: [1, 0], captured: false });
  });

  it("löst drei Parteien am selben Planeten in einem Schritt auf", () => {
    const map = lineMap();
    // Beide brauchen 5 Ticks zur Mitte (Planet 4, Garnison 20).
    let step = resolveTick(map, initialState(map), [
      [{ from: 0, to: 4, ships: 50 }],
      [{ from: 1, to: 4, ships: 35 }],
    ]);
    for (let i = 0; i < 4; i++) step = resolveTick(map, step.state, none);
    expect(step.state.tick).toBe(5);
    // Größte Kraft 50, zweitgrößte 35: Sitz 0 gewinnt mit 15.
    expect(step.state.planets[4]).toEqual([0, 15]);
    expect(step.events).toEqual([
      { planet: 4, arrivals: [50, 35], before: [null, 20], after: [0, 15], captured: true },
    ]);
  });

  it("lässt den Planeten beim Besitzer, wenn die zwei größten Kräfte gleich sind", () => {
    const map = lineMap();
    let step = resolveTick(map, initialState(map), [
      [{ from: 0, to: 4, ships: 40 }],
      [{ from: 1, to: 4, ships: 40 }],
    ]);
    for (let i = 0; i < 4; i++) step = resolveTick(map, step.state, none);
    expect(step.state.planets[4]).toEqual([null, 0]);
  });

  it("summiert mehrere Flotten desselben Spielers, egal in welcher Reihenfolge", () => {
    const map = lineMap([
      [0, 100],
      [1, 100],
      [0, 50],
      [null, 10],
      [null, 60],
    ]);
    // Von 0 (5 Ticks) und von 2 (3 Ticks) zur Mitte, so gestartet, dass beide in Tick 5 ankommen.
    let step = resolveTick(map, initialState(map), [[{ from: 0, to: 4, ships: 40 }], []]);
    step = resolveTick(map, step.state, none);
    step = resolveTick(map, step.state, [[{ from: 2, to: 4, ships: 30 }], []]);
    step = resolveTick(map, step.state, none);
    step = resolveTick(map, step.state, none);
    expect(step.state.tick).toBe(5);
    expect(step.events).toEqual([
      { planet: 4, arrivals: [70, 0], before: [null, 60], after: [0, 10], captured: true },
    ]);
  });

  it("lässt den Verteidiger mit Verstärkung im selben Tick bestehen", () => {
    const map = lineMap([
      [0, 100],
      [1, 100],
      [null, 10],
      [null, 10],
      [1, 20],
    ]);
    let step = resolveTick(map, initialState(map), [
      [{ from: 0, to: 4, ships: 60 }],
      [{ from: 1, to: 4, ships: 30 }],
    ]);
    for (let i = 0; i < 4; i++) step = resolveTick(map, step.state, none);
    // Verteidiger: 20 + 5 * 3 Produktion + 30 = 65 gegen 60.
    expect(step.state.planets[4]).toEqual([1, 5]);
    expect(step.events[0].before).toEqual([1, 35]);
    expect(step.events[0].captured).toBe(false);
  });
});

describe("Spielende", () => {
  it("läuft weiter, solange beide etwas besitzen und das Limit nicht erreicht ist", () => {
    const map = lineMap();
    expect(outcome(map, initialState(map), 300)).toBeNull();
  });

  it("endet sofort, wenn ein Spieler weder Planeten noch Flotten hat", () => {
    const map = lineMap([
      [0, 100],
      [1, 3],
      [null, 10],
      [null, 10],
      [null, 20],
    ]);
    let step = resolveTick(map, initialState(map), [[{ from: 0, to: 1, ships: 100 }], []]);
    for (let i = 0; i < 9; i++) {
      expect(outcome(map, step.state, 300)).toBeNull();
      step = resolveTick(map, step.state, none);
    }
    expect(step.state.planets[1][0]).toBe(0);
    expect(outcome(map, step.state, 300)).toEqual({ winner: 0, reason: "elimination" });
  });

  it("endet nicht, solange der Spieler ohne Planet noch eine Flotte hat", () => {
    const map = lineMap([
      [0, 100],
      [1, 30],
      [null, 10],
      [null, 10],
      [null, 20],
    ]);
    const state: GameState = {
      tick: 5,
      planets: [
        [0, 100],
        [0, 3],
        [null, 10],
        [null, 10],
        [null, 20],
      ],
      fleets: [{ id: 1, owner: 1, from: 1, to: 3, ships: 30, depart: 4, arrive: 6 }],
      nextFleetId: 2,
    };
    expect(outcome(map, state, 300)).toBeNull();
  });

  it("ist unentschieden, wenn beide im selben Tick ausgelöscht sind", () => {
    const map = lineMap();
    const state: GameState = {
      tick: 9,
      planets: [
        [null, 0],
        [null, 0],
        [null, 10],
        [null, 10],
        [null, 20],
      ],
      fleets: [],
      nextFleetId: 1,
    };
    expect(outcome(map, state, 300)).toEqual({ winner: null, reason: "draw" });
  });

  it("wertet am Tick-Limit nach Schiffen, Flotten zählen mit", () => {
    const map = lineMap();
    const state: GameState = {
      tick: 300,
      planets: [
        [0, 50],
        [1, 60],
        [null, 10],
        [null, 10],
        [null, 20],
      ],
      fleets: [{ id: 1, owner: 0, from: 0, to: 2, ships: 11, depart: 299, arrive: 301 }],
      nextFleetId: 2,
    };
    expect(seatTotals(map, state)[0].ships).toBe(61);
    expect(outcome(map, state, 300)).toEqual({ winner: 0, reason: "ships" });
    expect(outcome(map, state, 301)).toBeNull();
  });

  it("wertet bei gleich vielen Schiffen nach Produktion, sonst unentschieden", () => {
    const map = lineMap();
    const planets: PlanetState[] = [
      [0, 50],
      [1, 40],
      [null, 10],
      [1, 10],
      [null, 20],
    ];
    const state: GameState = { tick: 300, planets, fleets: [], nextFleetId: 1 };
    expect(outcome(map, state, 300)).toEqual({ winner: 1, reason: "growth" });
    const even: GameState = { ...state, planets: [[0, 50], [1, 50], [null, 1], [null, 1], [null, 1]] };
    expect(outcome(map, even, 300)).toEqual({ winner: null, reason: "draw" });
  });
});

describe("Fairness", () => {
  it("hält den Zustand gespiegelt, wenn beide gespiegelt spielen", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = generateMap({ seed, planets: 23 });
      const random = mulberry32(seed + 1000);
      let state = initialState(map);
      for (let tick = 0; tick < 120; tick++) {
        const mine: Order[] = [];
        state.planets.forEach(([owner, ships], id) => {
          if (owner !== 0 || ships < 2 || random() < 0.6) return;
          let to = Math.floor(random() * map.planets.length);
          if (to === id) to = (to + 1) % map.planets.length;
          mine.push({ from: id, to, ships: 1 + Math.floor(random() * (ships - 1)) });
        });
        const mirrored = mine.map(({ from, to, ships }) => ({ from: twinOf(map, from), to: twinOf(map, to), ships }));
        state = resolveTick(map, state, [mine, mirrored]).state;
        state.planets.forEach(([owner, ships], id) => {
          const [twinOwner, twinShips] = state.planets[twinOf(map, id)];
          expect(twinShips).toBe(ships);
          expect(twinOwner).toBe(owner === null ? null : 1 - owner);
        });
        const [a, b] = seatTotals(map, state);
        expect(a).toEqual(b);
      }
    }
  });

  it("hält Garnisonen ganzzahlig und nie negativ", () => {
    const map = generateMap({ seed: 11, planets: 24 });
    const random = mulberry32(77);
    let state = initialState(map);
    for (let tick = 0; tick < 200; tick++) {
      const orders: [Order[], Order[]] = [[], []];
      state.planets.forEach(([owner, ships], id) => {
        if (owner === null || ships < 1 || random() < 0.5) return;
        orders[owner].push({ from: id, to: Math.floor(random() * map.planets.length), ships: Math.ceil(random() * ships) });
      });
      state = resolveTick(map, state, orders).state;
      for (const [, ships] of state.planets) {
        expect(Number.isInteger(ships)).toBe(true);
        expect(ships).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
