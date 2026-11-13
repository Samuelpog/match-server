import type { ArenaMap, Fleet, Frame, MatchMeta, Owner, PlanetState, Player } from "../model";

/**
 * Testmaterial für die Ansicht: erzeugt den Verlauf eines kleinen Matches,
 * damit Zeichenfläche, Zeitleiste und Anzeigen ohne Server geprüft werden
 * können. Das ist keine Spiel-Engine. Regeln, Karten und Bots des echten
 * Spiels liegen in `src/lib/planetwars` und können hiervon abweichen.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FixtureOptions {
  seed?: number;
  /** Planetenpaare neben den beiden Heimatplaneten und dem Planeten in der Mitte. */
  pairs?: number;
  tickLimit?: number;
  tickMs?: number;
  names?: [string, string];
}

export interface FixtureMatch {
  meta: MatchMeta;
  map: ArenaMap;
  frames: Frame[];
}

const WIDTH = 32;
const HEIGHT = 20;

function makeMap(random: () => number, pairs: number): { map: ArenaMap; start: PlanetState[] } {
  const planets: ArenaMap["planets"] = [];
  const start: PlanetState[] = [];
  const far = (x: number, y: number) => planets.every((p) => Math.hypot(p.x - x, p.y - y) > 3.4);

  const add = (x: number, y: number, growth: number, owner: Owner, ships: number) => {
    planets.push({ id: planets.length, x, y, growth });
    start.push({ owner, ships });
  };

  add(WIDTH / 2, HEIGHT / 2, 4, 0, 60);
  add(3.5, HEIGHT - 3.5, 5, 1, 100);
  add(WIDTH - 3.5, 3.5, 5, 2, 100);
  let guard = 0;
  while (planets.length < 3 + pairs * 2 && guard++ < 2000) {
    const x = 2 + random() * (WIDTH - 4);
    const y = 2 + random() * (HEIGHT - 4);
    const mx = WIDTH - x;
    const my = HEIGHT - y;
    // Punktsymmetrisch zur Mitte: jede Seite bekommt denselben Planeten gespiegelt.
    if (!far(x, y) || !far(mx, my) || Math.hypot(x - mx, y - my) <= 3.4) continue;
    const growth = 1 + Math.floor(random() * 5);
    const ships = 5 + Math.floor(random() * 60);
    add(x, y, growth, 0, ships);
    add(mx, my, growth, 0, ships);
  }
  return { map: { width: WIDTH, height: HEIGHT, planets }, start };
}

/** Sehr einfacher Bot: schickt von starken Planeten zum lohnendsten Ziel. */
function orders(
  map: ArenaMap,
  planets: PlanetState[],
  incoming: number[][],
  me: Player,
  random: () => number,
  boldness: number,
) {
  const result: { from: number; to: number; ships: number }[] = [];
  planets.forEach((source, from) => {
    if (source.owner !== me || source.ships < 12 || random() > boldness) return;
    let best = -1;
    let bestScore = 0;
    planets.forEach((target, to) => {
      if (to === from) return;
      const distance = Math.hypot(map.planets[from].x - map.planets[to].x, map.planets[from].y - map.planets[to].y);
      const mine = target.owner === me;
      const needed = mine ? 0 : target.ships + (target.owner === 0 ? 0 : map.planets[to].growth * distance) + 1;
      const already = incoming[to][me - 1];
      if (mine || already > needed || needed > source.ships * 0.85) return;
      const score = map.planets[to].growth / (needed + 4) / (distance + 4);
      if (score > bestScore) {
        bestScore = score;
        best = to;
      }
    });
    if (best >= 0) {
      const target = planets[best];
      const distance = Math.hypot(
        map.planets[from].x - map.planets[best].x,
        map.planets[from].y - map.planets[best].y,
      );
      const needed = target.ships + (target.owner === 0 ? 0 : map.planets[best].growth * distance) + 2;
      result.push({ from, to: best, ships: Math.min(source.ships - 1, Math.ceil(needed * 1.15)) });
    }
  });
  return result;
}

export function simulateFixture(options: FixtureOptions = {}): FixtureMatch {
  const seed = options.seed ?? 7;
  const tickLimit = options.tickLimit ?? 300;
  const random = mulberry32(seed);
  const { map, start } = makeMap(random, options.pairs ?? 9);

  let planets = start.map((planet) => ({ ...planet }));
  const frames: Frame[] = [{ t: 0, planets: planets.map((planet) => ({ ...planet })), launches: [] }];
  let flying: Fleet[] = [];
  let winner: Owner | null = null;
  let reason: string | null = null;
  let nextId = 1;

  for (let t = 1; t <= tickLimit && winner === null; t++) {
    const incoming = planets.map(() => [0, 0]);
    for (const fleet of flying) incoming[fleet.to][fleet.owner - 1] += fleet.ships;

    const launches: Fleet[] = [];
    for (const me of [1, 2] as const) {
      for (const order of orders(map, planets, incoming, me, random, me === 1 ? 0.22 : 0.18)) {
        const source = planets[order.from];
        if (order.ships < 1 || order.ships > source.ships) continue;
        source.ships -= order.ships;
        const a = map.planets[order.from];
        const b = map.planets[order.to];
        launches.push({
          id: `f${nextId++}`,
          owner: me,
          from: order.from,
          to: order.to,
          ships: order.ships,
          launch: t,
          arrive: t + Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y))),
        });
      }
    }
    flying.push(...launches);

    planets = planets.map((planet, index) =>
      planet.owner === 0 ? planet : { ...planet, ships: planet.ships + map.planets[index].growth },
    );

    const landing = flying.filter((fleet) => fleet.arrive === t);
    flying = flying.filter((fleet) => fleet.arrive !== t);
    const byPlanet = new Map<number, [number, number]>();
    for (const fleet of landing) {
      const forces = byPlanet.get(fleet.to) ?? [0, 0];
      forces[fleet.owner - 1] += fleet.ships;
      byPlanet.set(fleet.to, forces);
    }
    for (const [index, arrived] of byPlanet) {
      const planet = planets[index];
      const forces = [planet.owner === 0 ? planet.ships : 0, arrived[0], arrived[1]];
      if (planet.owner !== 0) forces[planet.owner] += planet.ships;
      const ranked = [0, 1, 2].sort((x, y) => forces[y] - forces[x]);
      const [first, second] = ranked;
      const left = forces[first] - forces[second];
      planets[index] = left === 0 ? { owner: planet.owner, ships: 0 } : { owner: first as Owner, ships: left };
    }

    frames.push({ t, planets: planets.map((planet) => ({ ...planet })), launches });

    const alive = [1, 2].map(
      (player) => planets.some((planet) => planet.owner === player) || flying.some((fleet) => fleet.owner === player),
    );
    if (!alive[0] || !alive[1]) {
      winner = alive[0] ? 1 : alive[1] ? 2 : 0;
      reason = "Gegner ausgelöscht";
    }
  }

  if (winner === null) {
    const total = [1, 2].map(
      (player) =>
        planets.reduce((sum, planet) => sum + (planet.owner === player ? planet.ships : 0), 0) +
        flying.reduce((sum, fleet) => sum + (fleet.owner === player ? fleet.ships : 0), 0),
    );
    winner = total[0] === total[1] ? 0 : total[0] > total[1] ? 1 : 2;
    reason = "Tick-Limit erreicht, mehr Schiffe";
  }

  const names = options.names ?? ["Vorschau Blau", "Vorschau Orange"];
  return {
    map,
    frames,
    meta: {
      id: `vorschau-${seed}`,
      status: "finished",
      tickLimit,
      tickMs: options.tickMs ?? 400,
      players: [
        { name: names[0], online: null, builtIn: true },
        { name: names[1], online: null, builtIn: true },
      ],
      result: { winner, reason },
    },
  };
}
