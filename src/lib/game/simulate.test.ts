import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { replayFile } from "@/lib/arena/replay-file-v2";
import { BUILTIN_BOTS, getBuiltinBot } from "./bots";
import { generateMap } from "./mapgen";
import { simulate } from "./simulate";
import type { BotFunction } from "./types";

const play = (id: string) => getBuiltinBot(id)!.play;

/**
 * Das Beispiel-Match für die Ansicht: `standard` gegen `sturm` auf Karte 207.
 * Sitz 1 reicht in drei Runden zusätzlich eine ungültige Aktion ein, damit
 * auch Ablehnungen vorkommen. Am Spielverlauf ändert das nichts.
 */
function exampleReplay() {
  const map = generateMap({ seed: 207, planets: 15 });
  const sturm = play("sturm");
  const withMistakes: BotFunction = (view) => {
    const actions = sturm(view);
    const home = view.planets.find((planet) => planet.home === view.you)!.id;
    const enemyHome = view.planets.find((planet) => planet.home !== null && planet.home !== view.you)!.id;
    if (view.round === 4) return [...actions, { type: "move", from: enemyHome, to: home, ships: 5 }];
    if (view.round === 9) return [...actions, { type: "move", from: home, to: enemyHome, ships: 1 }];
    if (view.round === 14) return [...actions, { type: "build", planet: home, building: "fortress" }];
    return actions;
  };
  const { frames, result } = simulate({ map, bots: [play("standard"), withMistakes] });
  return replayFile({
    id: "beispiel-stufe1",
    map,
    frames,
    result,
    names: ["Standard", "Sturm"],
    bots: ["standard", "sturm"],
    options: { rounds: 120, roundMs: 8000, timeoutMs: 5000 },
    label: "Beispiel-Replay Stufe 1",
    createdAt: Date.UTC(2026, 10, 13),
  });
}

describe("simulate", () => {
  it("ist deterministisch", () => {
    const map = generateMap({ seed: 11, planets: 15 });
    const a = simulate({ map, bots: [play("standard"), play("sturm")] });
    const b = simulate({ map, bots: [play("standard"), play("sturm")] });
    expect(a.frames).toEqual(b.frames);
    expect(a.result).toEqual(b.result);
  });

  it("liefert lückenlose Frames mit Flotten, die ihre Kennung behalten", () => {
    const map = generateMap({ seed: 5, planets: 17 });
    const { frames } = simulate({ map, bots: [play("standard"), play("sturm")] });
    frames.forEach((frame, index) => expect(frame.round).toBe(index));
    for (let index = 1; index < frames.length; index++) {
      const frame = frames[index];
      const before = new Map(frames[index - 1].fleets.map((fleet) => [fleet.id, fleet]));
      const gone = new Set<number>();
      for (const event of frame.events) {
        if (event.step === "arrival") event.fleets.forEach((id) => gone.add(id));
        if (event.step === "route") event.fleets.filter((entry) => entry.after === 0).forEach((entry) => gone.add(entry.id));
      }
      const now = new Set(frame.fleets.map((fleet) => fleet.id));
      // Jede Flotte von vorher fliegt noch oder ein Ereignis nennt ihr Ende.
      for (const id of before.keys()) expect(now.has(id) || gone.has(id)).toBe(true);
      for (const fleet of frame.fleets) {
        expect(fleet.progress).toBeLessThan(fleet.length);
        const old = before.get(fleet.id);
        if (old) expect(fleet.progress).toBe(old.progress + 1);
        else expect(fleet.progress).toBe(0);
        expect(fleet.arrive).toBe(frame.round + fleet.length - fleet.progress);
      }
    }
  });

  it("lässt eingebaute Bots nie eine abgelehnte Aktion einreichen und im Limit bleiben", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const map = generateMap({ seed, planets: 15 });
      const { frames } = simulate({ map, bots: [play("standard"), play("sturm")] });
      for (const frame of frames) {
        for (const records of frame.actions) expect(records.every((record) => record.ok)).toBe(true);
        for (const seat of frame.players) expect(seat.actions.used).toBeLessThanOrEqual(seat.actions.limit);
      }
    }
  });

  it("endet unentschieden, wenn derselbe Bot auf beiden Sitzen spielt", () => {
    for (const bot of BUILTIN_BOTS) {
      for (let seed = 1; seed <= 20; seed++) {
        const map = generateMap({ seed, planets: 15 });
        const { result, frames } = simulate({ map, bots: [bot.play, bot.play] });
        expect(result).toEqual({ winner: null, reason: "draw" });
        for (const frame of frames) expect(frame.players[0].score).toBe(frame.players[1].score);
      }
    }
  });

  it("spiegelt das Ergebnis, wenn die Sitze getauscht werden", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const map = generateMap({ seed, planets: 15 });
      const a = simulate({ map, bots: [play("standard"), play("sturm")] }).result;
      const b = simulate({ map, bots: [play("sturm"), play("standard")] }).result;
      expect(b.reason).toBe(a.reason);
      expect(b.winner).toBe(a.winner === null ? null : 1 - a.winner);
    }
  });
});

describe("Beispiel-Replay", () => {
  const path = resolve(__dirname, "../../../fixtures/replay-v2-stufe1.json");

  it("enthält alles, was die Ansicht zeigen muss", () => {
    const replay = exampleReplay();
    const events = replay.frames.flatMap((frame) => frame.events);
    const codes = replay.frames.flatMap((frame) => frame.actions.flat().map((record) => record.code));
    const length = (route: [number, number]) => replay.map.routes.find(([a, b]) => a === route[0] && b === route[1])![2];
    const battles = events.filter((event) => event.step === "route");
    expect(replay.match.result).toEqual({ winner: 0, reason: "home" });
    expect(battles.some((event) => event.at > 0 && event.at < length(event.route))).toBe(true);
    expect(battles.some((event) => event.at === 0 || event.at === length(event.route))).toBe(true);
    expect(events.some((event) => event.step === "arrival" && event.kind === "reinforce")).toBe(true);
    expect(events.some((event) => event.step === "arrival" && event.captured && event.before.owner !== null)).toBe(true);
    expect(codes).toEqual(expect.arrayContaining(["not_owner", "no_route", "not_available"]));
  });

  it("stimmt mit fixtures/replay-v2-stufe1.json überein", () => {
    const text = JSON.stringify(exampleReplay());
    if (process.env.UPDATE_FIXTURE || !existsSync(path)) writeFileSync(path, text + "\n");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(JSON.parse(text));
  });
});
