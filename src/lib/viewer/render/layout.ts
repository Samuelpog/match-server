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

export function computeLayout(map: ArenaMap, width: number, height: number): Layout {
  const planets = map.planets;
  const maxGrowth = Math.max(1, ...planets.map((planet) => planet.growth));

  let minDistance = Infinity;
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      minDistance = Math.min(minDistance, Math.hypot(planets[i].x - planets[j].x, planets[i].y - planets[j].y));
    }
  }
  if (!Number.isFinite(minDistance) || minDistance <= 0) minDistance = Math.max(map.width, map.height) / 4;

  // Rand so wählen, dass auch der größte Planet am Kartenrand samt Leuchten ganz im Bild bleibt.
  const margin = Math.max(28, Math.min(width, height) * 0.09);
  const scale = Math.max(
    0.01,
    Math.min((width - 2 * margin) / Math.max(1, map.width), (height - 2 * margin) / Math.max(1, map.height)),
  );
  const offsetX = (width - map.width * scale) / 2;
  const offsetY = (height - map.height * scale) / 2;

  // Zwei Nachbarn dürfen sich nie berühren: höchstens 44 % des kleinsten Abstands.
  const ceiling = Math.min(minDistance * scale * 0.44, Math.min(width, height) * 0.085, 46);
  const largest = Math.max(ceiling, Math.min(MIN_RADIUS, minDistance * scale * 0.48));
  const smallest = Math.min(largest, Math.max(MIN_RADIUS, largest * 0.48));

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
