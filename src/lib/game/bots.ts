import { neighbors, roundDistances } from "./graph";
import type { Action, BotFunction, BotView, GameMap, PlanetView } from "./types";

export interface BuiltinBot {
  id: string;
  name: string;
  description: string;
  play: BotFunction;
}

/** Die Karte, wie die Hilfen in `graph.ts` sie brauchen. Je Routenliste nur einmal gebaut. */
const mapCache = new WeakMap<object, GameMap>();
function mapOf(view: BotView): GameMap {
  let map = mapCache.get(view.routes);
  if (!map) {
    map = { planets: view.planets, routes: view.routes } as unknown as GameMap;
    mapCache.set(view.routes, map);
  }
  return map;
}

/**
 * Reihenfolge für Gleichstände. Sitz 1 zählt über die Zwillinge, damit zwei
 * gleiche Bots auf der gespiegelten Karte gespiegelt spielen.
 */
function canon(view: BotView, id: number): number {
  return view.you === 0 ? id : view.planets[id].twin;
}

interface Situation {
  map: GameMap;
  mine: PlanetView[];
  enemyHome: number;
  /** Eigene und fremde Schiffe, die zu einem Planeten unterwegs sind. */
  incomingOwn: number[];
  incomingEnemy: number[];
}

function situation(view: BotView): Situation {
  const incomingOwn = view.planets.map(() => 0);
  const incomingEnemy = view.planets.map(() => 0);
  for (const fleet of view.fleets) (fleet.owner === view.you ? incomingOwn : incomingEnemy)[fleet.to] += fleet.ships;
  return {
    map: mapOf(view),
    mine: view.planets.filter((planet) => planet.owner === view.you),
    enemyHome: view.planets.find((planet) => planet.home !== null && planet.home !== view.you)!.id,
    incomingOwn,
    incomingEnemy,
  };
}

/** Schiffe, die es braucht, um das Ziel nach `length` Runden Flug zu nehmen. */
function needed(view: BotView, target: PlanetView, length: number): number {
  if (target.owner === null) return target.ships + 1;
  const guard = target.home === target.owner ? view.params.home.guard : 0;
  return target.ships + target.growth * length + guard + 1;
}

/** Tut nichts. Messgegner. */
const passiv: BotFunction = () => [];

/**
 * Zieht auf dem kürzesten Weg zum gegnerischen Heimatplaneten und nimmt nur,
 * was auf diesem Weg liegt. Messgegner für die Grundverteidigung.
 */
const sturm: BotFunction = (view) => {
  const { map, mine, enemyHome } = situation(view);
  const rounds = roundDistances(map);
  const moves: { action: Action; ships: number; order: number }[] = [];
  for (const planet of mine) {
    if (planet.ships < 1) continue;
    const next = neighbors(map)[planet.id]
      .map((entry) => ({ ...entry, total: entry.length + rounds[entry.planet][enemyHome] }))
      .sort((a, b) => a.total - b.total || canon(view, a.planet) - canon(view, b.planet))[0];
    const target = view.planets[next.planet];
    if (target.owner !== view.you && planet.ships < needed(view, target, next.length)) continue;
    moves.push({
      action: { type: "move", from: planet.id, to: next.planet, ships: planet.ships },
      ships: planet.ships,
      order: canon(view, planet.id),
    });
  }
  moves.sort((a, b) => b.ships - a.ships || a.order - b.order);
  return moves.slice(0, view.actions.limit).map((move) => move.action);
};

/**
 * Standard-Bot: hält, was bedroht ist, nimmt die lohnendsten Nachbarn und
 * schiebt Schiffe aus dem Hinterland an die Front.
 */
const standard: BotFunction = (view) => {
  const { map, mine, enemyHome, incomingOwn, incomingEnemy } = situation(view);
  const rounds = roundDistances(map);
  const near = neighbors(map);
  const available = view.planets.map((planet) =>
    planet.owner === view.you ? Math.max(0, planet.ships - incomingEnemy[planet.id]) : 0,
  );
  // Der Heimatplanet behält, was er gegen alles braucht, das ihn in wenigen Runden erreichen kann.
  const home = view.planets.find((planet) => planet.home === view.you)!;
  const reach = 4;
  let threat = 0;
  for (const planet of view.planets) {
    if (planet.owner !== null && planet.owner !== view.you && rounds[planet.id][home.id] <= reach) threat += planet.ships;
  }
  for (const fleet of view.fleets) {
    if (fleet.owner !== view.you && fleet.length - fleet.progress + rounds[fleet.to][home.id] <= reach) threat += fleet.ships;
  }
  const reserve = Math.max(0, threat + 1 - view.params.home.guard);
  if (home.owner === view.you) available[home.id] = Math.max(0, home.ships - reserve);

  const actions: Action[] = [];
  const claimed = new Set<number>();
  const left = () => view.actions.limit - actions.length;

  // 0. Verteidigung: Fehlt dem Heimatplaneten Besatzung, schicken die Nachbarn, was sie haben.
  let missing = home.owner === view.you ? reserve - home.ships - incomingOwn[home.id] : 0;
  if (missing > 0) {
    const helpers = near[home.id]
      .map((entry) => ({ ...entry, ships: available[entry.planet] }))
      .filter((entry) => entry.ships > 0)
      .sort((a, b) => a.length - b.length || b.ships - a.ships || canon(view, a.planet) - canon(view, b.planet));
    for (const helper of helpers) {
      if (missing <= 0 || left() <= 0) break;
      const ships = Math.min(helper.ships, missing);
      actions.push({ type: "move", from: helper.planet, to: home.id, ships });
      available[helper.planet] -= ships;
      missing -= ships;
    }
  }

  // 1. Eroberungen, die lohnendsten zuerst.
  const captures: { from: number; to: number; ships: number; value: number; order: number }[] = [];
  for (const planet of mine) {
    for (const { planet: to, length } of near[planet.id]) {
      const target = view.planets[to];
      if (target.owner === view.you) continue;
      const need = needed(view, target, length) + incomingEnemy[to] - incomingOwn[to];
      if (need <= 0 || need > available[planet.id]) continue;
      const prize = to === enemyHome ? 100 : target.growth + (target.hub ? 1 : 0) + (target.owner === null ? 0 : 1);
      captures.push({ from: planet.id, to, ships: need, value: prize / (need + 4 * length), order: canon(view, planet.id) * 100 + canon(view, to) });
    }
  }
  captures.sort((a, b) => b.value - a.value || a.order - b.order);
  for (const capture of captures) {
    if (left() <= 0) break;
    if (claimed.has(capture.to) || capture.ships > available[capture.from]) continue;
    claimed.add(capture.to);
    available[capture.from] -= capture.ships;
    actions.push({ type: "move", from: capture.from, to: capture.to, ships: capture.ships });
  }

  // 2. Nachschieben: Planeten ohne fremden Nachbarn schicken alles in Richtung Front.
  const frontier = (id: number) => near[id].some((entry) => view.planets[entry.planet].owner !== view.you);
  const pushes: { from: number; to: number; ships: number; order: number }[] = [];
  for (const planet of mine) {
    if (frontier(planet.id) || available[planet.id] < 4 || planet.id === home.id) continue;
    const next = near[planet.id]
      .map((entry) => ({ ...entry, total: entry.length + rounds[entry.planet][enemyHome] }))
      .sort((a, b) => a.total - b.total || canon(view, a.planet) - canon(view, b.planet))[0];
    pushes.push({ from: planet.id, to: next.planet, ships: available[planet.id], order: canon(view, planet.id) });
  }
  pushes.sort((a, b) => b.ships - a.ships || a.order - b.order);
  for (const push of pushes) {
    if (left() <= 0) break;
    actions.push({ type: "move", from: push.from, to: push.to, ships: push.ships });
  }
  return actions;
};

export const BUILTIN_BOTS: readonly BuiltinBot[] = [
  { id: "standard", name: "Standard", description: "Nimmt die lohnendsten Nachbarn und schiebt Schiffe an die Front.", play: standard },
  { id: "sturm", name: "Sturm", description: "Zieht auf dem kürzesten Weg zum gegnerischen Heimatplaneten.", play: sturm },
  { id: "passiv", name: "Passiv", description: "Tut nichts.", play: passiv },
];

/** Die beiden Bots eines Demo-Matches. */
export const DEMO_BOTS: [string, string] = ["standard", "sturm"];

export function getBuiltinBot(id: string): BuiltinBot | null {
  return BUILTIN_BOTS.find((bot) => bot.id === id) ?? null;
}

/** Ruft einen Bot auf. Wirft er oder liefert er Unsinn, zählt das als „keine Aktionen". */
export function runBot(play: BotFunction, view: BotView): unknown {
  try {
    const actions = play(view);
    return Array.isArray(actions) ? actions : [];
  } catch {
    return [];
  }
}
