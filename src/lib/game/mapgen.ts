import { shortestPaths } from "./graph";
import { PLANET_NAMES } from "./names";
import { mulberry32, randomInt } from "./rng";
import { LIMITS, PARAMS, type GameMap, type MapOptions, type PlanetDef, type PlanetState, type Route } from "./types";

/** Feldgröße in Karteneinheiten. Koordinaten sind ganze Zahlen, damit Spiegelung und Abstände exakt sind. */
const WIDTH = 200;
const HEIGHT = 140;
const MARGIN = 12;
/** Mindestabstand zwischen zwei Planeten. */
const MIN_GAP = 22;
/** Längste Strecke, über die es eine Route gibt. */
const MAX_ROUTE = 75;
/** So nah darf kein dritter Planet an einer Route liegen. */
const ROUTE_CLEARANCE = 12;
const MIN_DEGREE = 2;
const MAX_DEGREE = 4;
const HOME_MIN_FROM_CENTER = 55;
const HOME_MIN_ROUTES = 4;
const HOME_MIN_ROUNDS = 6;
const FLANK_MIN = 32;
const FLANK_MAX = 52;
const MAX_ATTEMPTS = 5000;

interface Point {
  x: number;
  y: number;
}

const CENTER: Point = { x: WIDTH / 2, y: HEIGHT / 2 };

function mirror(point: Point): Point {
  return { x: WIDTH - point.x, y: HEIGHT - point.y };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function inField(point: Point): boolean {
  return point.x >= MARGIN && point.x <= WIDTH - MARGIN && point.y >= MARGIN && point.y <= HEIGHT - MARGIN;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Schneiden sich die Strecken a–b und c–d im Inneren? Gemeinsame Endpunkte zählen nicht. */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Flugzeit in Runden: Entfernung geteilt durch die Strecke je Runde, aufgerundet. */
function roundsFor(distance: number): number {
  return Math.max(1, Math.ceil(distance / PARAMS.unitsPerRound));
}

interface Layout {
  points: Point[];
  twin: number[];
  growth: number[];
  ships: number[];
}

/**
 * Setzt die Planeten. Reihenfolge der IDs: 0 und 1 Heimatplaneten, 2 der
 * Mittelplanet, 3 und 4 die Flanken-Knoten, danach Zwillingspaare.
 */
function layout(random: () => number, count: number): Layout | null {
  const points: Point[] = [];
  const twin: number[] = [];
  const growth: number[] = [];
  const ships: number[] = [];
  const free = (point: Point) => inField(point) && points.every((other) => dist(point, other) >= MIN_GAP);

  function addPair(point: Point, rate: number, garrison: number): boolean {
    const other = mirror(point);
    if (!free(point) || !free(other) || dist(point, other) < MIN_GAP) return false;
    const id = points.length;
    points.push(point, other);
    twin.push(id + 1, id);
    growth.push(rate, rate);
    ships.push(garrison, garrison);
    return true;
  }
  function tryPair(make: () => Point, rate: () => number, garrison: (rate: number) => number): boolean {
    for (let attempt = 0; attempt < 200; attempt++) {
      const r = rate();
      if (addPair(make(), r, garrison(r))) return true;
    }
    return false;
  }
  const anywhere = () => ({
    x: randomInt(random, MARGIN, WIDTH - MARGIN),
    y: randomInt(random, MARGIN, HEIGHT - MARGIN),
  });

  // Heimatplaneten, weit von der Mitte.
  let home: Point | null = null;
  for (let attempt = 0; attempt < 200 && !home; attempt++) {
    const point = anywhere();
    if (dist(point, CENTER) >= HOME_MIN_FROM_CENTER) home = point;
  }
  if (!home || !addPair(home, PARAMS.home.growth, PARAMS.home.ships)) return null;

  // Mittelplanet.
  points.push(CENTER);
  twin.push(2);
  growth.push(3);
  ships.push(30);

  // Flanken-Knoten auf der Mittelsenkrechten der Heimatplaneten.
  const axis = { x: home.x - CENTER.x, y: home.y - CENTER.y };
  const norm = Math.hypot(axis.x, axis.y);
  const perp = { x: -axis.y / norm, y: axis.x / norm };
  const flank = () => {
    const t = randomInt(random, FLANK_MIN, FLANK_MAX);
    return { x: Math.round(CENTER.x + perp.x * t), y: Math.round(CENTER.y + perp.y * t) };
  };
  if (!tryPair(flank, () => 2, () => 20)) return null;

  while (points.length < count) {
    const ok = tryPair(
      anywhere,
      () => randomInt(random, 1, 3),
      (rate) => rate * 5 + randomInt(random, 0, 5),
    );
    if (!ok) return null;
  }
  return { points, twin, growth, ships };
}

/** Legt die Routen: kürzeste zuerst, immer zusammen mit der gespiegelten. */
function connect(points: Point[], twin: number[]): Route[] {
  const count = points.length;
  const candidates: { a: number; b: number; d: number }[] = [];
  for (let a = 0; a < count; a++)
    for (let b = a + 1; b < count; b++) {
      const d = dist(points[a], points[b]);
      if (d <= MAX_ROUTE) candidates.push({ a, b, d });
    }
  candidates.sort((x, y) => x.d - y.d || x.a - y.a || x.b - y.b);

  const degree = new Array<number>(count).fill(0);
  const routes: Route[] = [];
  const has = (a: number, b: number) => routes.some((route) => route[0] === Math.min(a, b) && route[1] === Math.max(a, b));
  const fits = (a: number, b: number) =>
    routes.every(([c, d]) => !segmentsCross(points[a], points[b], points[c], points[d])) &&
    points.every((point, id) => id === a || id === b || pointToSegment(point, points[a], points[b]) >= ROUTE_CLEARANCE);

  for (const { a, b, d } of candidates) {
    if (has(a, b)) continue;
    const ta = twin[a];
    const tb = twin[b];
    const selfMirrored = Math.min(ta, tb) === a && Math.max(ta, tb) === b;
    const added: [number, number][] = selfMirrored ? [[a, b]] : [[a, b], [ta, tb]];
    const extra = new Map<number, number>();
    for (const [p, q] of added) {
      extra.set(p, (extra.get(p) ?? 0) + 1);
      extra.set(q, (extra.get(q) ?? 0) + 1);
    }
    if ([...extra].some(([id, more]) => degree[id] + more > MAX_DEGREE)) continue;
    if (!fits(a, b) || (!selfMirrored && (!fits(ta, tb) || segmentsCross(points[a], points[b], points[ta], points[tb])))) continue;
    for (const [p, q] of added) {
      routes.push([Math.min(p, q), Math.max(p, q), roundsFor(d)]);
      degree[p] += 1;
      degree[q] += 1;
    }
  }
  return routes.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

function valid(count: number, routes: Route[]): boolean {
  const degree = new Array<number>(count).fill(0);
  for (const [a, b] of routes) {
    degree[a] += 1;
    degree[b] += 1;
  }
  if (degree.some((value) => value < MIN_DEGREE)) return false;
  const rounds = shortestPaths(count, routes, (length) => length);
  if (rounds.some((row) => row.some((value) => !Number.isFinite(value)))) return false;
  const hops = shortestPaths(count, routes, () => 1);
  if (hops[0][1] < HOME_MIN_ROUTES || rounds[0][1] < HOME_MIN_ROUNDS) return false;
  // Jeder Knoten ist von beiden Heimatplaneten gleich viele Runden entfernt.
  return [2, 3, 4].every((hub) => rounds[hub][0] === rounds[hub][1]);
}

/**
 * Erzeugt eine punktsymmetrische Karte mit Routennetz. Gleicher Seed und
 * gleiche Anzahl ergeben dieselbe Karte. Karten, die eine Regel aus `a-0004`
 * Abschnitt 1 verletzen, werden verworfen und neu gezogen.
 */
export function generateMap(options: MapOptions): GameMap {
  const { seed, planets: count } = options;
  if (!(LIMITS.planetCounts as readonly number[]).includes(count)) {
    throw new RangeError(`Die Planetenzahl muss ${LIMITS.planetCounts.join(" oder ")} sein.`);
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Der Seed muss eine ganze Zahl von 0 bis 4294967295 sein.");
  }

  const random = mulberry32(seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const placed = layout(random, count);
    if (!placed) continue;
    const routes = connect(placed.points, placed.twin);
    if (!valid(count, routes)) continue;

    const names = [...PLANET_NAMES];
    const planets: PlanetDef[] = placed.points.map((point, id) => ({
      id,
      name: names.splice(randomInt(random, 0, names.length - 1), 1)[0],
      x: point.x,
      y: point.y,
      growth: placed.growth[id],
      home: id === 0 ? 0 : id === 1 ? 1 : null,
      hub: id >= 2 && id <= 4,
      twin: placed.twin[id],
    }));
    const initial: PlanetState[] = placed.ships.map((ships, id) => ({
      owner: id === 0 ? 0 : id === 1 ? 1 : null,
      ships,
      building: null,
      supply: null,
    }));
    return { seed, width: WIDTH, height: HEIGHT, planets, routes, homes: [0, 1], hubs: [2, 3, 4], initial };
  }
  throw new Error(`Für Seed ${seed} ließ sich keine gültige Karte erzeugen.`);
}
