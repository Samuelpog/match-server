import {
  LIMITS,
  type Fleet,
  type GameMap,
  type GameResult,
  type GameState,
  type Order,
  type Owner,
  type PlanetEvent,
  type PlanetState,
  type RejectCode,
  type RejectedOrder,
  type Seat,
} from "./types";

export const SEATS: readonly Seat[] = [0, 1];

/** Gerade Strecke zwischen zwei Planeten in Karteneinheiten. */
export function distance(map: GameMap, from: number, to: number): number {
  const a = map.planets[from];
  const b = map.planets[to];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Flugzeit in Ticks: aufgerundeter Abstand geteilt durch die Geschwindigkeit, mindestens 1. */
export function travelTicks(map: GameMap, from: number, to: number): number {
  return Math.max(1, Math.ceil(distance(map, from, to) / map.speed));
}

/** Zustand zu Tick 0. */
export function initialState(map: GameMap): GameState {
  return {
    tick: 0,
    planets: map.initial.map(([owner, ships]) => [owner, ships]),
    fleets: [],
    nextFleetId: 1,
  };
}

export interface TickResult {
  /** Zustand nach dem Tick. */
  state: GameState;
  /** In diesem Tick gestartete Flotten. */
  launches: Fleet[];
  /** Ankünfte und Kämpfe, aufsteigend nach Planet. */
  events: PlanetEvent[];
  /** Anzahl angenommener Befehle je Sitz. */
  accepted: [number, number];
  rejected: [RejectedOrder[], RejectedOrder[]];
}

const REJECT_TEXT: Record<RejectCode, string> = {
  malformed: 'Ein Befehl muss die Form { "from": Planet, "to": Planet, "ships": Anzahl } haben.',
  unknown_planet: "Start oder Ziel ist kein Planet dieser Karte.",
  same_planet: "Start und Ziel sind derselbe Planet.",
  not_owner: "Der Startplanet gehört dir nicht.",
  bad_ship_count: "Die Schiffszahl muss eine ganze Zahl ab 1 sein.",
  not_enough_ships: "Auf dem Startplaneten stehen nicht genug Schiffe.",
  too_many_orders: `Mehr als ${LIMITS.maxOrdersPerTick} Befehle je Tick werden nicht angenommen.`,
};

function isPlanetId(map: GameMap, value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < map.planets.length;
}

/**
 * Prüft die Befehle eines Sitzes der Reihe nach gegen `planets` und zieht die
 * Schiffe gültiger Befehle dort sofort ab. Ungültige werden einzeln abgelehnt.
 */
function applyOrders(
  map: GameMap,
  planets: PlanetState[],
  seat: Seat,
  orders: unknown,
): { valid: Order[]; rejected: RejectedOrder[] } {
  const valid: Order[] = [];
  const rejected: RejectedOrder[] = [];
  if (!Array.isArray(orders)) return { valid, rejected };

  orders.forEach((raw: unknown, index) => {
    const reject = (code: RejectCode) => rejected.push({ index, code, message: REJECT_TEXT[code] });
    if (index >= LIMITS.maxOrdersPerTick) return reject("too_many_orders");
    if (raw === null || typeof raw !== "object") return reject("malformed");
    const { from, to, ships } = raw as Record<string, unknown>;
    if (typeof from !== "number" || typeof to !== "number" || typeof ships !== "number") return reject("malformed");
    if (!isPlanetId(map, from) || !isPlanetId(map, to)) return reject("unknown_planet");
    if (from === to) return reject("same_planet");
    if (planets[from][0] !== seat) return reject("not_owner");
    if (!Number.isInteger(ships) || ships < 1) return reject("bad_ship_count");
    if (ships > planets[from][1]) return reject("not_enough_ships");
    planets[from][1] -= ships;
    valid.push({ from, to, ships });
  });
  return { valid, rejected };
}

/**
 * Rechnet die Ankünfte an einem Planeten ab. Kräfte werden je Partei
 * summiert, die größte gewinnt und behält die Differenz zur zweitgrößten.
 * Bei Gleichstand der beiden größten bleibt der Besitzer, mit 0 Schiffen.
 */
function settle(before: PlanetState, arrivals: [number, number]): PlanetState {
  const [owner, garrison] = before;
  const forces: { who: Owner; ships: number }[] = [
    { who: null, ships: owner === null ? garrison : 0 },
    { who: 0, ships: arrivals[0] + (owner === 0 ? garrison : 0) },
    { who: 1, ships: arrivals[1] + (owner === 1 ? garrison : 0) },
  ];
  forces.sort((a, b) => b.ships - a.ships);
  const [first, second] = forces;
  if (first.ships > second.ships) return [first.who, first.ships - second.ships];
  return [owner, 0];
}

/**
 * Löst einen Tick auf: Start der Flotten, Produktion, Ankunft mit Kampf.
 * Reine Funktion, `state` bleibt unverändert. `orders[sitz]` sind die rohen
 * Befehle des Sitzes, ungeprüft.
 */
export function resolveTick(map: GameMap, state: GameState, orders: [unknown, unknown]): TickResult {
  const tick = state.tick + 1;
  const planets: PlanetState[] = state.planets.map(([owner, ships]) => [owner, ships]);
  let nextFleetId = state.nextFleetId;

  // 1. Start. Jeder Sitz schickt nur von eigenen Planeten, die Reihenfolge der Sitze ist deshalb egal.
  const launches: Fleet[] = [];
  const accepted: [number, number] = [0, 0];
  const rejected: [RejectedOrder[], RejectedOrder[]] = [[], []];
  for (const seat of SEATS) {
    const result = applyOrders(map, planets, seat, orders[seat]);
    accepted[seat] = result.valid.length;
    rejected[seat] = result.rejected;
    const byRoute = new Map<number, Fleet>();
    for (const { from, to, ships } of result.valid) {
      const route = from * map.planets.length + to;
      const existing = byRoute.get(route);
      if (existing) {
        existing.ships += ships;
        continue;
      }
      const fleet: Fleet = {
        id: nextFleetId++,
        owner: seat,
        from,
        to,
        ships,
        depart: state.tick,
        arrive: state.tick + travelTicks(map, from, to),
      };
      byRoute.set(route, fleet);
      launches.push(fleet);
    }
  }

  // 2. Produktion.
  planets.forEach((planet, id) => {
    if (planet[0] !== null) planet[1] += map.planets[id].growth;
  });

  // 3. Ankunft.
  const flying: Fleet[] = [];
  const arriving = new Map<number, [number, number]>();
  for (const fleet of [...state.fleets, ...launches]) {
    if (fleet.arrive > tick) {
      flying.push(fleet);
      continue;
    }
    const sums = arriving.get(fleet.to) ?? [0, 0];
    sums[fleet.owner] += fleet.ships;
    arriving.set(fleet.to, sums);
  }
  const events: PlanetEvent[] = [...arriving.keys()]
    .sort((a, b) => a - b)
    .map((planet) => {
      const arrivals = arriving.get(planet)!;
      const before: PlanetState = [planets[planet][0], planets[planet][1]];
      const after = settle(before, arrivals);
      planets[planet] = after;
      return { planet, arrivals, before, after: [after[0], after[1]], captured: after[0] !== before[0] };
    });

  return {
    state: { tick, planets, fleets: flying, nextFleetId },
    launches: launches.map((fleet) => ({ ...fleet })),
    events,
    accepted,
    rejected,
  };
}

export interface SeatTotals {
  /** Schiffe auf Planeten und in Flotten. */
  ships: number;
  /** Summe der Produktionsraten der eigenen Planeten. */
  growth: number;
  planets: number;
  fleets: number;
}

export function seatTotals(map: GameMap, state: GameState): [SeatTotals, SeatTotals] {
  const totals: [SeatTotals, SeatTotals] = [
    { ships: 0, growth: 0, planets: 0, fleets: 0 },
    { ships: 0, growth: 0, planets: 0, fleets: 0 },
  ];
  state.planets.forEach(([owner, ships], id) => {
    if (owner === null) return;
    totals[owner].ships += ships;
    totals[owner].growth += map.planets[id].growth;
    totals[owner].planets += 1;
  });
  for (const fleet of state.fleets) {
    totals[fleet.owner].ships += fleet.ships;
    totals[fleet.owner].fleets += 1;
  }
  return totals;
}

/**
 * Ergebnis des Spiels oder `null`, solange es läuft. Auslöschung beendet das
 * Spiel sofort, sonst wird am Tick-Limit nach Schiffen und dann nach
 * Produktion gewertet.
 */
export function outcome(map: GameMap, state: GameState, tickLimit: number): GameResult | null {
  const [a, b] = seatTotals(map, state);
  const aliveA = a.planets > 0 || a.fleets > 0;
  const aliveB = b.planets > 0 || b.fleets > 0;
  if (!aliveA && !aliveB) return { winner: null, reason: "draw" };
  if (!aliveB) return { winner: 0, reason: "elimination" };
  if (!aliveA) return { winner: 1, reason: "elimination" };
  if (state.tick < tickLimit) return null;
  if (a.ships !== b.ships) return { winner: a.ships > b.ships ? 0 : 1, reason: "ships" };
  if (a.growth !== b.growth) return { winner: a.growth > b.growth ? 0 : 1, reason: "growth" };
  return { winner: null, reason: "draw" };
}
