import { routeLength } from "./graph";
import {
  LIMITS,
  PARAMS,
  RULES,
  SEATS,
  type ActionRecord,
  type ArrivalEvent,
  type BotView,
  type Fleet,
  type GameEvent,
  type GameMap,
  type GameResult,
  type GameState,
  type Owner,
  type PlanetState,
  type RejectCode,
  type RouteBattleEvent,
  type Seat,
} from "./types";

function copyPlanet(planet: PlanetState): PlanetState {
  return { owner: planet.owner, ships: planet.ships, building: planet.building ? { ...planet.building } : null, supply: planet.supply };
}

/** Zustand vor Runde 1. */
export function initialState(map: GameMap): GameState {
  return { round: 0, planets: map.initial.map(copyPlanet), fleets: [], nextFleetId: 1 };
}

/** Ist auf dem Planeten ein Ausbau dieser Art fertig? `round` ist die laufende Runde. */
function hasBuilding(planet: PlanetState, type: string, round: number): boolean {
  return planet.building !== null && planet.building.type === type && planet.building.ready < round;
}

/** Aktionen, die ein Sitz in der nächsten Runde hat: Grundwert plus fertige Kommandozentralen, gedeckelt. */
export function actionLimit(state: GameState, seat: Seat): number {
  const round = state.round + 1;
  const centres = state.planets.filter((planet) => planet.owner === seat && hasBuilding(planet, "command", round)).length;
  return Math.min(PARAMS.actions.max, PARAMS.actions.base + centres);
}

/** Schiffe, die ein Planet je Runde produziert, mit Werft. Neutrale produzieren nichts. */
export function productionOf(map: GameMap, state: GameState, id: number): number {
  const planet = state.planets[id];
  if (planet.owner === null) return 0;
  const growth = map.planets[id].growth;
  return hasBuilding(planet, "shipyard", state.round + 1) ? Math.ceil(growth * PARAMS.shipyardFactor) : growth;
}

/** Stärke, mit der ein Planet verteidigt: Besatzung, mit Festung anderthalbfach, am Heimatplaneten plus Heimatschutz. */
export function defenseStrength(map: GameMap, planet: PlanetState, id: number, round: number, garrison = planet.ships): number {
  const factor = hasBuilding(planet, "fortress", round) ? PARAMS.fortressFactor : 1;
  const guard = planet.owner !== null && map.planets[id].home === planet.owner ? PARAMS.home.guard : 0;
  return Math.floor(garrison * factor) + guard;
}

function isPlanetId(map: GameMap, value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < map.planets.length;
}

interface Applied {
  records: ActionRecord[];
  used: number;
  limit: number;
  /** Gültige Züge in eingereichter Reihenfolge, mit der Position ihres Eintrags in `records`. */
  moves: { index: number; from: number; to: number; ships: number }[];
}

/**
 * Prüft die Aktionen eines Sitzes der Reihe nach gegen `planets` und zieht
 * die Schiffe gültiger Züge dort sofort ab. Ungültige werden einzeln
 * abgelehnt und zählen nicht gegen das Limit.
 */
function applyActions(map: GameMap, planets: PlanetState[], seat: Seat, limit: number, input: unknown): Applied {
  const records: ActionRecord[] = [];
  const moves: Applied["moves"] = [];
  let used = 0;
  if (!Array.isArray(input)) return { records, used, limit, moves };

  input.slice(0, LIMITS.maxActionsChecked).forEach((raw: unknown, index) => {
    const reject = (code: RejectCode) => records.push({ action: raw, ok: false, code });
    if (raw === null || typeof raw !== "object") return reject("bad_action");
    const action = raw as Record<string, unknown>;
    if (action.type === "build" || action.type === "supply") {
      if (!(PARAMS.actionTypes as string[]).includes(action.type)) return reject("not_available");
    }
    if (action.type !== "move") return reject("bad_action");
    const { from, to, ships } = action;
    if (typeof from !== "number" || typeof to !== "number" || typeof ships !== "number") return reject("bad_action");
    if (used >= limit) return reject("action_limit");
    if (!isPlanetId(map, from) || !isPlanetId(map, to)) return reject("bad_planet");
    if (planets[from].owner !== seat) return reject("not_owner");
    if (routeLength(map, from, to) === null) return reject("no_route");
    if (!Number.isInteger(ships) || ships < 1) return reject("bad_ships");
    if (ships > planets[from].ships) return reject("not_enough_ships");
    planets[from].ships -= ships;
    used += 1;
    moves.push({ index, from, to, ships });
    records.push({ action: raw, ok: true });
  });
  return { records, used, limit, moves };
}

/**
 * Prüft Aktionen gegen einen Stand, ohne ihn zu verändern. Da jeder Sitz nur
 * über eigene Planeten verfügt, steht das Ergebnis schon beim Einreichen fest.
 */
export function checkActions(map: GameMap, state: GameState, seat: Seat, input: unknown): ActionRecord[] {
  return applyActions(map, state.planets.map(copyPlanet), seat, actionLimit(state, seat), input).records.map(
    ({ action, ok, code }) => (code ? { action, ok, code } : { action, ok }),
  );
}

export interface RoundResult {
  /** Zustand nach der Runde. */
  state: GameState;
  actions: [ActionRecord[], ActionRecord[]];
  events: GameEvent[];
  used: [number, number];
  limits: [number, number];
}

/** Abstand einer Flotte von `route[0]`, dem Planeten mit der kleineren Nummer. */
function positionOf(fleet: Fleet): number {
  return fleet.from < fleet.to ? fleet.progress : fleet.length - fleet.progress;
}

/**
 * Schritt 3: Kampf auf der Route. Zwei Flotten verschiedener Spieler kämpfen,
 * wenn sie auf derselben Route in entgegengesetzter Richtung fliegen und sich
 * in dieser Runde treffen oder aneinander vorbeikämen. Die größere überlebt
 * mit der Differenz.
 */
function routeBattles(fleets: Fleet[], launched: Set<number>): RouteBattleEvent[] {
  const events: RouteBattleEvent[] = [];
  const byRoute = new Map<string, Fleet[]>();
  for (const fleet of fleets) {
    const key = `${Math.min(fleet.from, fleet.to)}-${Math.max(fleet.from, fleet.to)}`;
    const list = byRoute.get(key);
    if (list) list.push(fleet);
    else byRoute.set(key, [fleet]);
  }
  const keys = [...byRoute.keys()].sort((x, y) => {
    const [a1, b1] = x.split("-").map(Number);
    const [a2, b2] = y.split("-").map(Number);
    return a1 - a2 || b1 - b2;
  });

  for (const key of keys) {
    const onRoute = byRoute.get(key)!;
    const [a, b] = key.split("-").map(Number);
    for (;;) {
      // Das Paar, das sich am weitesten durchdrungen hat, kämpft zuerst: das sind die vordersten beider Richtungen.
      let best: { up: Fleet; down: Fleet; overlap: number } | null = null;
      for (const up of onRoute) {
        if (up.ships <= 0 || up.from !== a) continue;
        for (const down of onRoute) {
          if (down.ships <= 0 || down.from !== b || down.owner === up.owner) continue;
          const overlap = positionOf(up) - positionOf(down);
          if (overlap < 0) continue;
          const better =
            best === null ||
            overlap > best.overlap ||
            (overlap === best.overlap && up.ships + down.ships > best.up.ships + best.down.ships) ||
            (overlap === best.overlap &&
              up.ships + down.ships === best.up.ships + best.down.ships &&
              Math.min(up.id, down.id) < Math.min(best.up.id, best.down.id));
          if (better) best = { up, down, overlap };
        }
      }
      if (!best) break;
      const { up, down } = best;
      const upMoved = !launched.has(up.id);
      const downMoved = !launched.has(down.id);
      const upBefore = positionOf(up) - (upMoved ? 1 : 0);
      const downBefore = positionOf(down) + (downMoved ? 1 : 0);
      const length = up.length;
      const meeting = upMoved && downMoved ? (upBefore + downBefore) / 2 : upMoved ? downBefore : upBefore;
      const at = Math.max(0, Math.min(length, Math.round(meeting * 2) / 2));
      const before = [up.ships, down.ships];
      const loss = Math.min(up.ships, down.ships);
      up.ships -= loss;
      down.ships -= loss;
      const entries = [
        { id: up.id, owner: up.owner, before: before[0], after: up.ships },
        { id: down.id, owner: down.owner, before: before[1], after: down.ships },
      ].sort((x, y) => x.owner - y.owner);
      events.push({ step: "route", kind: "battle", route: [a, b], at, fleets: entries });
    }
  }
  return events;
}

/**
 * Schritt 4 an einem Planeten. Flotten des Besitzers verstärken, fremde
 * werden je Spieler zusammengezählt. Die stärkste Partei gewinnt und behält
 * die Differenz zur zweitstärksten. Bei Gleichstand der beiden stärksten
 * behält der Besitzer den Planeten mit 0 Schiffen.
 */
function settle(map: GameMap, planet: PlanetState, id: number, round: number, arriving: Fleet[]): ArrivalEvent {
  const before = { owner: planet.owner, ships: planet.ships };
  const arrivals: [number, number] = [0, 0];
  for (const fleet of arriving) arrivals[fleet.owner] += fleet.ships;
  const owner = planet.owner;
  const garrison = planet.ships + (owner === null ? 0 : arrivals[owner]);
  const strength = defenseStrength(map, planet, id, round, garrison);
  const attackers = SEATS.filter((seat) => seat !== owner && arrivals[seat] > 0);
  const fleets = arriving.map((fleet) => fleet.id).sort((x, y) => x - y);

  const base = { step: "arrival" as const, fleets, arrivals, before, defense: { strength } };
  if (attackers.length === 0) {
    planet.ships = garrison;
    return { ...base, planet: id, kind: "reinforce", after: { owner, ships: garrison }, captured: false, destroyed: null };
  }

  const parties: { who: Owner; force: number; defender: boolean }[] = [
    { who: owner, force: strength, defender: true },
    ...attackers.map((seat) => ({ who: seat as Owner, force: arrivals[seat], defender: false })),
  ];
  parties.sort((x, y) => y.force - x.force);
  const [first, second] = parties;
  let destroyed: ArrivalEvent["destroyed"] = null;
  if (first.force === second.force) {
    planet.ships = 0;
  } else if (first.defender) {
    // Der Heimatschutz fängt zuerst ab, der Rest trifft die Besatzung. Mit Festung kostet er nur zwei Drittel.
    const guard = strength - Math.floor(garrison * (hasBuilding(planet, "fortress", round) ? PARAMS.fortressFactor : 1));
    const rest = Math.max(0, second.force - guard);
    const factor = hasBuilding(planet, "fortress", round) ? PARAMS.fortressFactor : 1;
    planet.ships = garrison - Math.ceil(rest / factor);
  } else {
    destroyed = planet.building?.type ?? null;
    planet.owner = first.who;
    planet.ships = first.force - second.force;
    planet.building = null;
    planet.supply = null;
  }
  return {
    ...base,
    planet: id,
    kind: "battle",
    after: { owner: planet.owner, ships: planet.ships },
    captured: planet.owner !== before.owner,
    destroyed,
  };
}

/**
 * Löst eine Runde auf, in den sieben Schritten aus `a-0004` Abschnitt 4.
 * Reine Funktion, `state` bleibt unverändert. `input[sitz]` sind die rohen
 * Aktionen des Sitzes, ungeprüft.
 */
export function resolveRound(map: GameMap, state: GameState, input: [unknown, unknown]): RoundResult {
  const round = state.round + 1;
  const planets = state.planets.map(copyPlanet);
  const fleets: Fleet[] = state.fleets.map((fleet) => ({ ...fleet }));
  let nextFleetId = state.nextFleetId;
  const events: GameEvent[] = [];

  // 1. Aktionen. Jeder Sitz verfügt nur über eigene Planeten, die Reihenfolge der Sitze ist deshalb egal.
  const launched = new Set<number>();
  const actions: [ActionRecord[], ActionRecord[]] = [[], []];
  const used: [number, number] = [0, 0];
  const limits: [number, number] = [actionLimit(state, 0), actionLimit(state, 1)];
  for (const seat of SEATS) {
    const applied = applyActions(map, planets, seat, limits[seat], input[seat]);
    actions[seat] = applied.records;
    used[seat] = applied.used;
    const byRoute = new Map<number, Fleet>();
    for (const move of applied.moves) {
      const key = move.from * map.planets.length + move.to;
      let fleet = byRoute.get(key);
      if (fleet) {
        fleet.ships += move.ships;
      } else {
        const length = routeLength(map, move.from, move.to)!;
        fleet = {
          id: nextFleetId++,
          owner: seat,
          from: move.from,
          to: move.to,
          ships: move.ships,
          progress: 0,
          length,
          arrive: round + length,
          supply: false,
        };
        byRoute.set(key, fleet);
        fleets.push(fleet);
        launched.add(fleet.id);
      }
      applied.records[move.index].fleet = fleet.id;
    }
  }

  // 2. Bewegung. Wer in dieser Runde gestartet ist, rückt erst in der nächsten vor.
  for (const fleet of fleets) if (!launched.has(fleet.id)) fleet.progress += 1;

  // 3. Kampf auf der Route.
  events.push(...routeBattles(fleets, launched));
  const alive = fleets.filter((fleet) => fleet.ships > 0);

  // 4. Ankunft.
  const flying: Fleet[] = [];
  const arriving = new Map<number, Fleet[]>();
  for (const fleet of alive) {
    if (fleet.progress < fleet.length) {
      flying.push(fleet);
      continue;
    }
    const list = arriving.get(fleet.to);
    if (list) list.push(fleet);
    else arriving.set(fleet.to, [fleet]);
  }
  for (const id of [...arriving.keys()].sort((x, y) => x - y)) {
    events.push(settle(map, planets[id], id, round, arriving.get(id)!));
  }

  // 5. Produktion. Ein eben eroberter Planet produziert schon für den neuen Besitzer.
  const produced: GameState = { round: state.round, planets, fleets: flying, nextFleetId };
  planets.forEach((planet, id) => {
    planet.ships += productionOf(map, produced, id);
  });

  // 6. Fertige Ausbauten.
  planets.forEach((planet, id) => {
    if (planet.building && planet.building.ready === round) {
      events.push({ step: "build", kind: "completed", planet: id, building: planet.building.type });
    }
  });

  return { state: { round, planets, fleets: flying, nextFleetId }, actions, events, used, limits };
}

export interface SeatTotals {
  /** Punkte: Summe des Wachstums der eigenen Planeten plus ein fester Wert je fertigem Ausbau. */
  score: number;
  /** Schiffe auf Planeten und in Flotten. */
  ships: number;
  planets: number;
  growth: number;
  production: number;
}

export function seatTotals(map: GameMap, state: GameState): [SeatTotals, SeatTotals] {
  const totals: [SeatTotals, SeatTotals] = [
    { score: 0, ships: 0, planets: 0, growth: 0, production: 0 },
    { score: 0, ships: 0, planets: 0, growth: 0, production: 0 },
  ];
  state.planets.forEach((planet, id) => {
    if (planet.owner === null) return;
    const total = totals[planet.owner];
    total.ships += planet.ships;
    total.planets += 1;
    total.growth += map.planets[id].growth;
    total.production += productionOf(map, state, id);
    total.score += map.planets[id].growth;
    if (planet.building && planet.building.ready <= state.round) total.score += PARAMS.scorePerBuilding;
  });
  for (const fleet of state.fleets) totals[fleet.owner].ships += fleet.ships;
  return totals;
}

/**
 * Ergebnis des Spiels oder `null`, solange es läuft. Ein eroberter
 * Heimatplanet beendet das Spiel sofort. Sonst entscheiden nach der letzten
 * Runde die Punkte, dann die Schiffe.
 */
export function outcome(map: GameMap, state: GameState, rounds: number): GameResult | null {
  const lost = SEATS.map((seat) => state.planets[map.homes[seat]].owner !== seat);
  if (lost[0] !== lost[1]) return { winner: lost[0] ? 1 : 0, reason: "home" };
  if (!lost[0] && state.round < rounds) return null;
  const [a, b] = seatTotals(map, state);
  if (a.score !== b.score) return { winner: a.score > b.score ? 0 : 1, reason: "points" };
  if (a.ships !== b.ships) return { winner: a.ships > b.ships ? 0 : 1, reason: "ships" };
  return { winner: null, reason: "draw" };
}

/** Der Stand aus Sicht eines Sitzes, wie ihn `state` liefert und ein Bot bekommt. */
export function viewFor(map: GameMap, state: GameState, you: Seat, rounds: number): BotView {
  const totals = seatTotals(map, state);
  return {
    rules: RULES,
    params: PARAMS,
    you,
    round: state.round + 1,
    rounds,
    actions: { limit: actionLimit(state, you) },
    score: [totals[0].score, totals[1].score],
    planets: map.planets.map((def, id) => ({ ...def, ...copyPlanet(state.planets[id]) })),
    routes: map.routes,
    fleets: state.fleets.map((fleet) => ({ ...fleet })),
  };
}

