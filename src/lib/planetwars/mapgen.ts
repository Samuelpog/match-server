import { randomInt, mulberry32 } from "./rng";
import { LIMITS, type GameMap, type MapOptions, type PlanetDef, type PlanetState } from "./types";

/** Feldgröße in Karteneinheiten. Koordinaten sind ganze Zahlen, damit Spiegelung und Abstände exakt sind. */
const WIDTH = 200;
const HEIGHT = 140;
const SPEED = 10;
const MARGIN = 12;
/** Mindestabstand zwischen zwei Planeten. */
const MIN_GAP = 18;
/** Mindestabstand eines Heimatplaneten von der Mitte, damit die Heimatplaneten weit auseinander liegen. */
const HOME_MIN_FROM_CENTER = 55;
const HOME_SHIPS = 100;
const HOME_GROWTH = 5;

interface Point {
  x: number;
  y: number;
}

function gapOk(point: Point, others: Point[], gap: number): boolean {
  return others.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= gap);
}

function mirror(point: Point): Point {
  return { x: WIDTH - point.x, y: HEIGHT - point.y };
}

/**
 * Erzeugt eine punktsymmetrische Karte. Planeten entstehen paarweise: jeder
 * zufällig gesetzte Planet bekommt einen an der Kartenmitte gespiegelten
 * Zwilling mit gleicher Produktionsrate und gleicher Garnison. Bei ungerader
 * Anzahl liegt ein Planet genau in der Mitte. So hat kein Sitz einen Vorteil.
 *
 * Reihenfolge der IDs: 0 und 1 sind die Heimatplaneten, danach folgen die
 * Zwillingspaare (2 und 3, 4 und 5, …), ein Mittelplanet steht am Ende.
 */
export function generateMap(options: MapOptions): GameMap {
  const { seed, planets: count } = options;
  if (!Number.isInteger(count) || count < LIMITS.minPlanets || count > LIMITS.maxPlanets) {
    throw new RangeError(`Die Planetenzahl muss eine ganze Zahl von ${LIMITS.minPlanets} bis ${LIMITS.maxPlanets} sein.`);
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Der Seed muss eine ganze Zahl von 0 bis 4294967295 sein.");
  }

  const random = mulberry32(seed);
  const center: Point = { x: WIDTH / 2, y: HEIGHT / 2 };
  const hasCenter = count % 2 === 1;
  const pairs = Math.floor(count / 2);

  const points: Point[] = [];
  const growth: number[] = [];
  const ships: number[] = [];
  /** Alle belegten Positionen, für die Abstandsprüfung. Der Mittelplanet wird vorab reserviert. */
  const taken: Point[] = hasCenter ? [center] : [];

  function place(accept: (point: Point) => boolean): Point {
    let gap = MIN_GAP;
    for (let attempt = 1; ; attempt++) {
      const point = {
        x: randomInt(random, MARGIN, WIDTH - MARGIN),
        y: randomInt(random, MARGIN, HEIGHT - MARGIN),
      };
      const twin = mirror(point);
      const farFromTwin = Math.hypot(point.x - twin.x, point.y - twin.y) >= gap;
      if (farFromTwin && accept(point) && gapOk(point, taken, gap) && gapOk(twin, taken, gap)) {
        taken.push(point, twin);
        return point;
      }
      // Findet sich lange kein Platz, wird der Abstand schrittweise gelockert. Unter 12 fällt er nie.
      if (attempt % 400 === 0 && gap > 12) gap -= 1;
    }
  }

  const home = place((point) => Math.hypot(point.x - center.x, point.y - center.y) >= HOME_MIN_FROM_CENTER);
  points.push(home, mirror(home));
  growth.push(HOME_GROWTH, HOME_GROWTH);
  ships.push(HOME_SHIPS, HOME_SHIPS);

  for (let pair = 1; pair < pairs; pair++) {
    const point = place(() => true);
    const rate = randomInt(random, 1, 5);
    // Größere Planeten sind im Schnitt besser verteidigt, die Streuung ist aber groß.
    const garrison = randomInt(random, 3, 25) + rate * randomInt(random, 0, 9);
    points.push(point, mirror(point));
    growth.push(rate, rate);
    ships.push(garrison, garrison);
  }

  if (hasCenter) {
    points.push(center);
    growth.push(randomInt(random, 2, 5));
    ships.push(randomInt(random, 20, 70));
  }

  const defs: PlanetDef[] = points.map((point, id) => ({ id, x: point.x, y: point.y, growth: growth[id] }));
  const initial: PlanetState[] = ships.map((count_, id) => [id === 0 ? 0 : id === 1 ? 1 : null, count_]);

  return { seed, width: WIDTH, height: HEIGHT, speed: SPEED, planets: defs, homes: [0, 1], initial };
}

/** Der an der Kartenmitte gespiegelte Planet. Ein Mittelplanet ist sein eigener Zwilling. */
export function twinOf(map: GameMap, id: number): number {
  const planet = map.planets[id];
  const x = map.width - planet.x;
  const y = map.height - planet.y;
  const twin = map.planets.find((other) => other.x === x && other.y === y);
  if (!twin) throw new Error(`Planet ${id} hat keinen Zwilling, die Karte ist nicht symmetrisch.`);
  return twin.id;
}
