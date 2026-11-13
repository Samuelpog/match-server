import { describe, expect, it } from "vitest";
import { neighbors, roundDistances, shortestPaths } from "./graph";
import { generateMap } from "./mapgen";
import { PARAMS } from "./types";

const SEEDS = Array.from({ length: 60 }, (_, index) => index + 1);
const COUNTS = [15, 17];

function eachMap(check: (map: ReturnType<typeof generateMap>) => void) {
  for (const planets of COUNTS) for (const seed of SEEDS) check(generateMap({ seed, planets }));
}

describe("generateMap", () => {
  it("ist deterministisch", () => {
    expect(generateMap({ seed: 7, planets: 15 })).toEqual(generateMap({ seed: 7, planets: 15 }));
    expect(generateMap({ seed: 7, planets: 15 })).not.toEqual(generateMap({ seed: 8, planets: 15 }));
  });

  it("lehnt andere Planetenzahlen und kaputte Seeds ab", () => {
    expect(() => generateMap({ seed: 1, planets: 16 })).toThrow(RangeError);
    expect(() => generateMap({ seed: 1, planets: 24 })).toThrow(RangeError);
    expect(() => generateMap({ seed: -1, planets: 15 })).toThrow(RangeError);
    expect(() => generateMap({ seed: 1.5, planets: 15 })).toThrow(RangeError);
  });

  it("ist punktsymmetrisch: Planeten, Besatzung und Routen", () => {
    eachMap((map) => {
      for (const planet of map.planets) {
        const twin = map.planets[planet.twin];
        expect(twin.twin).toBe(planet.id);
        expect([twin.x, twin.y]).toEqual([map.width - planet.x, map.height - planet.y]);
        expect(twin.growth).toBe(planet.growth);
        expect(map.initial[twin.id].ships).toBe(map.initial[planet.id].ships);
      }
      const keys = new Set(map.routes.map(([a, b, length]) => `${a}-${b}-${length}`));
      for (const [a, b, length] of map.routes) {
        const ta = map.planets[a].twin;
        const tb = map.planets[b].twin;
        expect(keys.has(`${Math.min(ta, tb)}-${Math.max(ta, tb)}-${length}`)).toBe(true);
      }
    });
  });

  it("hält Abstände, Routenlängen und Grad ein", () => {
    eachMap((map) => {
      const degree = map.planets.map(() => 0);
      for (const [a, b, length] of map.routes) {
        expect(a).toBeLessThan(b);
        const distance = Math.hypot(map.planets[a].x - map.planets[b].x, map.planets[a].y - map.planets[b].y);
        expect(distance).toBeLessThanOrEqual(75);
        expect(length).toBe(Math.max(1, Math.ceil(distance / PARAMS.unitsPerRound)));
        expect(length).toBeGreaterThanOrEqual(1);
        expect(length).toBeLessThanOrEqual(3);
        degree[a] += 1;
        degree[b] += 1;
      }
      for (const value of degree) {
        expect(value).toBeGreaterThanOrEqual(2);
        expect(value).toBeLessThanOrEqual(4);
      }
      for (const p of map.planets)
        for (const q of map.planets)
          if (p.id < q.id) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(22);
    });
  });

  it("legt Routen ohne Kreuzung und nicht dicht an dritten Planeten vorbei", () => {
    const side = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    eachMap((map) => {
      const at = (id: number) => [map.planets[id].x, map.planets[id].y];
      for (const [a, b] of map.routes) {
        for (const [c, d] of map.routes) {
          if (new Set([a, b, c, d]).size < 4) continue;
          const crossing =
            side(at(c), at(d), at(a)) * side(at(c), at(d), at(b)) < 0 &&
            side(at(a), at(b), at(c)) * side(at(a), at(b), at(d)) < 0;
          expect(crossing).toBe(false);
        }
        for (const planet of map.planets) {
          if (planet.id === a || planet.id === b) continue;
          const [ax, ay] = at(a);
          const [bx, by] = at(b);
          const t = Math.max(0, Math.min(1, ((planet.x - ax) * (bx - ax) + (planet.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
          expect(Math.hypot(planet.x - (ax + t * (bx - ax)), planet.y - (ay + t * (by - ay)))).toBeGreaterThanOrEqual(12);
        }
      }
    });
  });

  it("ist zusammenhängend, mit weit entfernten Heimatplaneten und gleich weit entfernten Knoten", () => {
    eachMap((map) => {
      const rounds = roundDistances(map);
      expect(rounds.flat().every(Number.isFinite)).toBe(true);
      const hops = shortestPaths(map.planets.length, map.routes, () => 1);
      const [home0, home1] = map.homes;
      expect(hops[home0][home1]).toBeGreaterThanOrEqual(4);
      expect(rounds[home0][home1]).toBeGreaterThanOrEqual(6);
      expect(map.hubs).toHaveLength(3);
      for (const hub of map.hubs) {
        expect(map.planets[hub].hub).toBe(true);
        expect(rounds[hub][home0]).toBe(rounds[hub][home1]);
      }
      expect(map.planets.filter((planet) => planet.hub)).toHaveLength(3);
    });
  });

  it("gibt Heimatplaneten die Startwerte und allen Planeten eindeutige kurze Namen", () => {
    eachMap((map) => {
      map.homes.forEach((id, seat) => {
        expect(map.planets[id].home).toBe(seat);
        expect(map.planets[id].growth).toBe(PARAMS.home.growth);
        expect(map.initial[id]).toEqual({ owner: seat, ships: PARAMS.home.ships, building: null, supply: null });
      });
      expect(map.initial.filter((planet) => planet.owner !== null)).toHaveLength(2);
      const names = map.planets.map((planet) => planet.name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) expect(name.length).toBeLessThanOrEqual(10);
    });
  });

  it("liefert Nachbarn aufsteigend nach Nummer", () => {
    const map = generateMap({ seed: 3, planets: 15 });
    for (const list of neighbors(map)) {
      expect(list.map((entry) => entry.planet)).toEqual([...list.map((entry) => entry.planet)].sort((a, b) => a - b));
    }
  });
});
