import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { replayFile } from "@/lib/arena/replay-file";
import { BUILTIN_BOTS, DEMO_BOTS, fleetsAt, generateMap, getBuiltinBot, initialState, resolveTick, runBot, simulate } from "./index";
import type { BotFunction } from "./types";

const play = (id: string) => getBuiltinBot(id)!.play;

describe("Simulation", () => {
  it("liefert lückenlose Frames von Tick 0 bis zum Ende", () => {
    const map = generateMap({ seed: 7, planets: 24 });
    const { frames, result, state } = simulate({ map, bots: [play("expansion"), play("sturm")], tickLimit: 300 });
    expect(frames[0].t).toBe(0);
    expect(frames[0].planets).toEqual(map.initial);
    frames.forEach((frame, index) => {
      expect(frame.t).toBe(index);
      expect(frame.planets).toHaveLength(24);
      for (const fleet of frame.launches) {
        expect(fleet.depart).toBe(frame.t - 1);
        expect(fleet.arrive).toBeGreaterThanOrEqual(frame.t);
      }
    });
    expect(frames.at(-1)!.t).toBe(state.tick);
    expect(state.tick).toBeLessThanOrEqual(300);
    expect(["elimination", "ships", "growth", "draw"]).toContain(result.reason);
  });

  it("ist deterministisch: gleiche Karte und gleiche Bots ergeben dasselbe Match", () => {
    const run = () =>
      simulate({ map: generateMap({ seed: 21, planets: 26 }), bots: [play("zufall"), play("expansion")], tickLimit: 200 });
    expect(run()).toEqual(run());
  });

  it("lässt die Flotten im Flug aus den Frames wiederherstellen", () => {
    const map = generateMap({ seed: 9, planets: 24 });
    const bots: [BotFunction, BotFunction] = [play("expansion"), play("sturm")];
    const { frames } = simulate({ map, bots, tickLimit: 60 });
    let state = initialState(map);
    for (let tick = 0; tick < frames.length - 1; tick++) {
      state = resolveTick(map, state, [
        runBot(bots[0], { map, state, you: 0, tickLimit: 60 }),
        runBot(bots[1], { map, state, you: 1, tickLimit: 60 }),
      ]).state;
      const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;
      expect(fleetsAt(frames, state.tick).sort(byId)).toEqual([...state.fleets].sort(byId));
    }
  });

  it("endet am Tick-Limit mit Wertung, wenn niemand ausgelöscht wird", () => {
    const map = generateMap({ seed: 1, planets: 20 });
    const { frames, result } = simulate({ map, bots: [play("passiv"), play("passiv")], tickLimit: 50 });
    expect(frames).toHaveLength(51);
    expect(result).toEqual({ winner: null, reason: "draw" });
    expect(frames[50].players[0].ships).toBe(100 + 50 * 5);
  });

  it("übersteht Bots, die abstürzen oder Unsinn liefern", () => {
    const map = generateMap({ seed: 2, planets: 20 });
    const broken: BotFunction = () => {
      throw new Error("kaputt");
    };
    const nonsense = (() => "nichts") as unknown as BotFunction;
    const { result } = simulate({ map, bots: [broken, nonsense], tickLimit: 30 });
    expect(result.reason).toBe("draw");
  });
});

describe("Eingebaute Bots", () => {
  it("geben nur gültige Befehle", () => {
    for (const a of BUILTIN_BOTS) {
      for (const b of BUILTIN_BOTS) {
        const { frames } = simulate({ map: generateMap({ seed: 5, planets: 24 }), bots: [a.play, b.play], tickLimit: 150 });
        for (const frame of frames) {
          expect(frame.players[0].rejected, `${a.id} gegen ${b.id}, Tick ${frame.t}`).toBe(0);
          expect(frame.players[1].rejected, `${b.id} gegen ${a.id}, Tick ${frame.t}`).toBe(0);
        }
      }
    }
  });

  it("schlagen den passiven Bot durch Auslöschung", () => {
    for (const id of ["expansion", "sturm"]) {
      for (const seed of [1, 2, 3]) {
        const map = generateMap({ seed, planets: 24 });
        expect(simulate({ map, bots: [play(id), play("passiv")] }).result).toEqual({ winner: 0, reason: "elimination" });
        expect(simulate({ map, bots: [play("passiv"), play(id)] }).result).toEqual({ winner: 1, reason: "elimination" });
      }
    }
  });
});

describe("Beispiel-Replay", () => {
  const path = new URL("../../../fixtures/replay-beispiel.json", import.meta.url);

  function build() {
    const map = generateMap({ seed: 2026, planets: 24 });
    const { frames, result } = simulate({ map, bots: [play(DEMO_BOTS[0]), play(DEMO_BOTS[1])], tickLimit: 300 });
    return replayFile({
      id: "beispiel",
      map,
      frames,
      result,
      names: ["Expansion", "Sturm"],
      bots: [DEMO_BOTS[0], DEMO_BOTS[1]],
      options: { tickLimit: 300 },
      label: "Beispiel-Replay",
      createdAt: Date.UTC(2026, 10, 13),
    });
  }

  it("entspricht dem, was die Engine heute erzeugt", () => {
    const replay = build();
    // Mit UPDATE_FIXTURE=1 wird die Datei neu geschrieben, etwa nach einer Regeländerung.
    if (process.env.UPDATE_FIXTURE) writeFileSync(path, JSON.stringify(replay) + "\n");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(replay);
  });
});
