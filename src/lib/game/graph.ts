import type { GameMap } from "./types";

export interface Neighbor {
  planet: number;
  /** Flugzeit in Runden. */
  length: number;
}

const neighborCache = new WeakMap<GameMap, Neighbor[][]>();
const distanceCache = new WeakMap<GameMap, number[][]>();

/** Nachbarn je Planet, aufsteigend nach Nummer. */
export function neighbors(map: GameMap): Neighbor[][] {
  let list = neighborCache.get(map);
  if (!list) {
    list = map.planets.map(() => []);
    for (const [a, b, length] of map.routes) {
      list[a].push({ planet: b, length });
      list[b].push({ planet: a, length });
    }
    for (const entry of list) entry.sort((x, y) => x.planet - y.planet);
    neighborCache.set(map, list);
  }
  return list;
}

/** Länge der Route zwischen zwei Planeten in Runden oder `null`, wenn es keine gibt. */
export function routeLength(map: GameMap, from: number, to: number): number | null {
  return neighbors(map)[from]?.find((entry) => entry.planet === to)?.length ?? null;
}

/** Kürzeste Flugzeit in Runden zwischen allen Planeten. `Infinity`, wenn es keinen Weg gibt. */
export function roundDistances(map: GameMap): number[][] {
  let table = distanceCache.get(map);
  if (!table) {
    table = shortestPaths(map.planets.length, map.routes, (length) => length);
    distanceCache.set(map, table);
  }
  return table;
}

/** Kürzeste Wege nach Floyd und Warshall. `weight` macht aus der Routenlänge die Kosten. */
export function shortestPaths(
  count: number,
  routes: readonly (readonly [number, number, number])[],
  weight: (length: number) => number,
): number[][] {
  const table = Array.from({ length: count }, (_, i) =>
    Array.from({ length: count }, (_, j) => (i === j ? 0 : Infinity)),
  );
  for (const [a, b, length] of routes) {
    table[a][b] = Math.min(table[a][b], weight(length));
    table[b][a] = table[a][b];
  }
  for (let k = 0; k < count; k++)
    for (let i = 0; i < count; i++)
      for (let j = 0; j < count; j++)
        if (table[i][k] + table[k][j] < table[i][j]) table[i][j] = table[i][k] + table[k][j];
  return table;
}
