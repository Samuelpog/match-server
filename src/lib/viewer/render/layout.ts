import type { ArenaMap } from "../model";

/** Wo die Karte auf der Zeichenfläche liegt und wie groß jeder Planet gezeichnet wird. */
export interface Layout {
  width: number;
  height: number;
  scale: number;
  /** Mittelpunkt jedes Planeten in Bildpunkten. */
  x: number[];
  y: number[];
  /** Radius jedes Planeten in Bildpunkten. */
  r: number[];
}

/** Kleinster Radius, in dem die Schiffszahl noch lesbar ist. */
const MIN_RADIUS = 13;

interface Bounds {
  minX: number;
  minY: number;
  spanX: number;
  spanY: number;
}

/** Rechteck um alle Planeten. Die Karte darf größer sein, gezeigt wird nur, wo etwas liegt. */
function bounds(map: ArenaMap): Bounds {
  if (map.planets.length === 0) return { minX: 0, minY: 0, spanX: Math.max(1, map.width), spanY: Math.max(1, map.height) };
  const xs = map.planets.map((planet) => planet.x);
  const ys = map.planets.map((planet) => planet.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, spanX: Math.max(1e-6, Math.max(...xs) - minX), spanY: Math.max(1e-6, Math.max(...ys) - minY) };
}

/** Seitenverhältnis, in dem die Karte die Fläche am besten füllt. */
export function mapAspect(map: ArenaMap): number {
  const box = bounds(map);
  // Etwas Rand in beiden Richtungen mitrechnen, sonst wirken schmale Karten zu lang gezogen.
  const pad = Math.max(box.spanX, box.spanY) * 0.16;
  return Math.min(2.1, Math.max(1.25, (box.spanX + pad) / (box.spanY + pad)));
}

export function computeLayout(map: ArenaMap, width: number, height: number): Layout {
  const planets = map.planets;
  const maxGrowth = Math.max(1, ...planets.map((planet) => planet.growth));
  const box = bounds(map);

  let minDistance = Infinity;
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      minDistance = Math.min(minDistance, Math.hypot(planets[i].x - planets[j].x, planets[i].y - planets[j].y));
    }
  }
  if (!Number.isFinite(minDistance) || minDistance <= 0) minDistance = Math.max(box.spanX, box.spanY) / 4;

  // Der Rand hängt vom größten Planeten ab und dessen Größe vom Maßstab: zwei Durchläufe genügen.
  let margin = Math.max(28, Math.min(width, height) * 0.09);
  let scale = 1;
  let largest = MIN_RADIUS;
  let smallest = MIN_RADIUS;
  for (let pass = 0; pass < 3; pass++) {
    scale = Math.max(0.01, Math.min((width - 2 * margin) / box.spanX, (height - 2 * margin) / box.spanY));
    // Zwei Nachbarn dürfen sich nie berühren: höchstens 44 % des kleinsten Abstands.
    const ceiling = Math.min(minDistance * scale * 0.44, Math.min(width, height) * 0.085, 46);
    largest = Math.max(ceiling, Math.min(MIN_RADIUS, minDistance * scale * 0.48));
    smallest = Math.min(largest, Math.max(MIN_RADIUS, largest * 0.5));
    // Platz für den Planeten am Rand samt Leuchten und der Zahl darunter.
    margin = Math.min(Math.min(width, height) * 0.3, largest * 1.45 + 14);
  }
  const offsetX = (width - box.spanX * scale) / 2 - box.minX * scale;
  const offsetY = (height - box.spanY * scale) / 2 - box.minY * scale;

  return {
    width,
    height,
    scale,
    x: planets.map((planet) => offsetX + planet.x * scale),
    y: planets.map((planet) => offsetY + planet.y * scale),
    r: planets.map((planet) => {
      if (planet.radius && planet.radius > 0) {
        return Math.min(largest, Math.max(smallest, planet.radius * scale));
      }
      // Fläche statt Radius wächst mit der Produktion, sonst wirken große Planeten übertrieben.
      return smallest + (largest - smallest) * Math.sqrt(planet.growth / maxGrowth);
    }),
  };
}

/** Index des Planeten unter einem Punkt, sonst `-1`. */
export function planetAt(layout: Layout, px: number, py: number): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < layout.r.length; i++) {
    const distance = Math.hypot(layout.x[i] - px, layout.y[i] - py);
    if (distance <= layout.r[i] + 6 && distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}
