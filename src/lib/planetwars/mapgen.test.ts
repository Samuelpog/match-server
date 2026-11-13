import { describe, expect, it } from "vitest";
import { distance, travelTicks } from "./engine";
import { generateMap, twinOf } from "./mapgen";

const SEEDS = [0, 1, 2, 7, 42, 1234, 99999, 4294967295];

describe("Kartengenerator", () => {
  it("liefert die gewünschte Anzahl Planeten, von 20 bis 30", () => {
    for (let planets = 20; planets <= 30; planets++) {
      const map = generateMap({ seed: 5, planets });
      expect(map.planets).toHaveLength(planets);
      expect(map.initial).toHaveLength(planets);
      map.planets.forEach((planet, index) => expect(planet.id).toBe(index));
    }
  });

  it("lehnt Planetenzahlen außerhalb des Bereichs ab", () => {
    expect(() => generateMap({ seed: 1, planets: 19 })).toThrow();
    expect(() => generateMap({ seed: 1, planets: 31 })).toThrow();
    expect(() => generateMap({ seed: 1, planets: 24.5 })).toThrow();
  });

  it("ist bei gleichem Seed identisch und bei anderem Seed anders", () => {
    expect(generateMap({ seed: 42, planets: 24 })).toEqual(generateMap({ seed: 42, planets: 24 }));
    expect(generateMap({ seed: 42, planets: 24 })).not.toEqual(generateMap({ seed: 43, planets: 24 }));
  });

  it("ist punktsymmetrisch: jeder Planet hat einen gespiegelten Zwilling", () => {
    for (const seed of SEEDS) {
      for (const planets of [20, 23, 24, 30]) {
        const map = generateMap({ seed, planets });
        for (const planet of map.planets) {
          const twin = map.planets[twinOf(map, planet.id)];
          expect(twin.x).toBe(map.width - planet.x);
          expect(twin.y).toBe(map.height - planet.y);
          expect(twin.growth).toBe(planet.growth);
          expect(map.initial[twin.id][1]).toBe(map.initial[planet.id][1]);
          expect(twinOf(map, twin.id)).toBe(planet.id);
        }
      }
    }
  });

  it("gibt beiden Spielern gleiche Heimatplaneten und lässt den Rest neutral", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed, planets: 24 });
      const [home0, home1] = map.homes;
      expect(twinOf(map, home0)).toBe(home1);
      expect(map.initial[home0]).toEqual([0, 100]);
      expect(map.initial[home1]).toEqual([1, 100]);
      expect(map.planets[home0].growth).toBe(5);
      map.initial.forEach(([owner, ships], id) => {
        if (id !== home0 && id !== home1) {
          expect(owner).toBeNull();
          expect(ships).toBeGreaterThanOrEqual(1);
        }
      });
    }
  });

  it("gibt beiden Spielern exakt gleiche Flugzeiten zu gespiegelten Zielen", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed, planets: 25 });
      for (const a of map.planets) {
        for (const b of map.planets) {
          if (a.id === b.id) continue;
          expect(travelTicks(map, a.id, b.id)).toBe(travelTicks(map, twinOf(map, a.id), twinOf(map, b.id)));
        }
      }
    }
  });

  it("hält Planeten im Feld, auf ganzen Koordinaten und auf Abstand", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed, planets: 30 });
      for (const a of map.planets) {
        expect(Number.isInteger(a.x) && Number.isInteger(a.y)).toBe(true);
        expect(a.x).toBeGreaterThan(0);
        expect(a.x).toBeLessThan(map.width);
        expect(a.y).toBeGreaterThan(0);
        expect(a.y).toBeLessThan(map.height);
        expect(a.growth).toBeGreaterThanOrEqual(1);
        expect(a.growth).toBeLessThanOrEqual(5);
        for (const b of map.planets) {
          if (a.id < b.id) expect(distance(map, a.id, b.id)).toBeGreaterThanOrEqual(12);
        }
      }
    }
  });

  it("legt die Heimatplaneten weit genug auseinander", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed, planets: 24 });
      expect(travelTicks(map, map.homes[0], map.homes[1])).toBeGreaterThanOrEqual(8);
    }
  });

  it("mischt die Garnisonen der neutralen Planeten", () => {
    const map = generateMap({ seed: 3, planets: 30 });
    const garrisons = new Set(map.initial.filter(([owner]) => owner === null).map(([, ships]) => ships));
    expect(garrisons.size).toBeGreaterThan(5);
  });
});
