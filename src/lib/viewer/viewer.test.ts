import { describe, expect, it } from "vitest";
import { replayFile } from "@/lib/arena/replay-file";
import { DEMO_BOTS, generateMap, getBuiltinBot, simulate } from "@/lib/planetwars";
import { parseReplayFile, toFrame, toMap, toMeta } from "./adapter";
import { ReplayBuffer, share } from "./buffer";
import { ArenaController } from "./controller";
import type { ArenaMap, Frame, MatchMeta } from "./model";

const map: ArenaMap = {
  width: 10,
  height: 10,
  planets: [
    { id: "a", x: 1, y: 1, growth: 2 },
    { id: "b", x: 9, y: 9, growth: 3 },
    { id: "c", x: 5, y: 5, growth: 1 },
  ],
};

function meta(status: MatchMeta["status"]): MatchMeta {
  return {
    id: "test",
    status,
    tickLimit: 100,
    tickMs: 100,
    players: [
      { name: "Eins", builtIn: false, joined: true, online: true, absent: false },
      { name: "Zwei", builtIn: false, joined: true, online: true, absent: false },
    ],
    result: status === "finished" ? { winner: 1, reason: "ships" } : null,
    series: null,
    label: null,
  };
}

/** Spieler 1 erobert c, Spieler 2 greift c vergeblich an, Spieler 1 verstärkt c. */
const frames: Frame[] = [
  { t: 0, planets: [{ owner: 1, ships: 50 }, { owner: 2, ships: 50 }, { owner: 0, ships: 10 }], launches: [] },
  {
    t: 1,
    planets: [{ owner: 1, ships: 22 }, { owner: 2, ships: 53 }, { owner: 0, ships: 10 }],
    launches: [{ id: "f1", owner: 1, from: 0, to: 2, ships: 30, launch: 0, arrive: 3 }],
  },
  {
    t: 2,
    planets: [{ owner: 1, ships: 24 }, { owner: 2, ships: 51 }, { owner: 0, ships: 10 }],
    launches: [{ id: "f2", owner: 2, from: 1, to: 2, ships: 5, launch: 1, arrive: 4 }],
  },
  { t: 3, planets: [{ owner: 1, ships: 26 }, { owner: 2, ships: 54 }, { owner: 1, ships: 20 }], launches: [] },
  {
    t: 4,
    planets: [{ owner: 1, ships: 18 }, { owner: 2, ships: 57 }, { owner: 1, ships: 16 }],
    launches: [{ id: "f3", owner: 1, from: 0, to: 2, ships: 10, launch: 3, arrive: 5 }],
  },
  { t: 5, planets: [{ owner: 1, ships: 20 }, { owner: 2, ships: 60 }, { owner: 1, ships: 27 }], launches: [] },
];

function filled(): ReplayBuffer {
  const buffer = new ReplayBuffer(map);
  for (const frame of frames) expect(buffer.append(frame)).toBe(true);
  return buffer;
}

describe("ReplayBuffer", () => {
  it("leitet Eroberung, abgewehrten Angriff und Verstärkung ab", () => {
    const buffer = filled();
    expect(buffer.events[3]).toMatchObject([{ planet: 2, kind: "capture", arrived: [30, 0] }]);
    expect(buffer.events[4]).toMatchObject([{ planet: 2, kind: "battle", arrived: [0, 5] }]);
    expect(buffer.events[5]).toMatchObject([{ planet: 2, kind: "reinforce", arrived: [10, 0] }]);
    expect(buffer.captures.map((event) => event.t)).toEqual([3]);
  });

  it("zählt Schiffe auf Planeten und in der Luft", () => {
    const buffer = filled();
    expect(buffer.stats[0]).toMatchObject({ ships: [50, 50], production: [2, 3], planets: [1, 1], neutralPlanets: 1 });
    expect(buffer.stats[1].inFlight).toEqual([30, 0]);
    expect(buffer.stats[2].inFlight).toEqual([30, 5]);
    expect(buffer.stats[3]).toMatchObject({ inFlight: [0, 5], onPlanets: [46, 54], production: [3, 3] });
    expect(buffer.stats[5]).toMatchObject({ inFlight: [0, 0], ships: [47, 60], planets: [2, 1], neutralPlanets: 0 });
  });

  it("nimmt Ereignisse des Servers, wenn er sie mitliefert", () => {
    const buffer = new ReplayBuffer(map);
    buffer.append(frames[0]);
    const given = { t: 1, planet: 1, kind: "battle" as const, arrived: [7, 0] as [number, number], before: frames[0].planets[1], after: frames[1].planets[1] };
    buffer.append({ ...frames[1], events: [given] });
    expect(buffer.events[1]).toEqual([given]);
  });

  it("zählt eine Flotte, die im selben Tick startet und ankommt, nie als in der Luft", () => {
    const buffer = new ReplayBuffer(map);
    buffer.append(frames[0]);
    buffer.append({
      t: 1,
      planets: [{ owner: 1, ships: 42 }, { owner: 2, ships: 53 }, { owner: 0, ships: 0 }],
      launches: [{ id: "kurz", owner: 1, from: 0, to: 2, ships: 10, launch: 0, arrive: 1 }],
    });
    expect(buffer.stats[1].inFlight).toEqual([0, 0]);
  });

  it("zeigt Flotten ab dem Start bis vor den Ankunfts-Tick, auch nach dem Zurückspulen", () => {
    const buffer = filled();
    const ids = (pos: number) => buffer.activeFleets(pos).map((fleet) => fleet.id);
    expect(ids(0.5)).toEqual(["f1"]);
    expect(ids(1)).toEqual(["f1", "f2"]);
    expect(ids(2.5)).toEqual(["f1", "f2"]);
    expect(ids(3)).toEqual(["f2", "f3"]);
    expect(ids(4.2)).toEqual(["f3"]);
    expect(ids(5)).toEqual([]);
    expect(ids(2.5)).toEqual(["f1", "f2"]);
  });

  it("nimmt bekannte Ticks hin und lehnt Lücken ab", () => {
    const buffer = new ReplayBuffer(map);
    expect(buffer.append(frames[0])).toBe(true);
    expect(buffer.append(frames[0])).toBe(true);
    expect(buffer.append(frames[2])).toBe(false);
    expect(buffer.lastTick).toBe(0);
  });

  it("liefert Ereignisse eines Zeitfensters", () => {
    const buffer = filled();
    expect(buffer.eventsWithin(4.5, 2).map((event) => event.t)).toEqual([3, 4]);
    expect(buffer.eventsWithin(2.9, 2)).toEqual([]);
  });

  it("teilt gleich, wenn beide nichts haben", () => {
    expect(share([0, 0])).toBe(0.5);
    expect(share([30, 10])).toBe(0.75);
  });
});

describe("ArenaController", () => {
  it("spielt ein beendetes Match von vorn ab und hält am Ende an", () => {
    const controller = new ArenaController(map, meta("finished"));
    controller.append(frames, 0);
    controller.advance(0);
    controller.advance(250);
    expect(controller.pos).toBeCloseTo(2.5);
    expect(controller.getState()).toMatchObject({ tick: 2, playing: true, following: false, atEnd: false });
    for (let now = 500; now <= 1000; now += 250) controller.advance(now);
    expect(controller.getState()).toMatchObject({ tick: 5, playing: false, atEnd: true });
    controller.play();
    expect(controller.pos).toBe(0);
  });

  it("folgt einem laufenden Match mit einem Tick Abstand und überholt den neuesten Frame nie", () => {
    const controller = new ArenaController(map, meta("running"));
    controller.append(frames.slice(0, 2), 0);
    controller.advance(0);
    controller.advance(200);
    expect(controller.pos).toBe(1);
    controller.append([frames[2]], 300);
    controller.advance(300);
    controller.advance(350);
    expect(controller.pos).toBeGreaterThan(1);
    expect(controller.pos).toBeLessThan(2);
    expect(controller.getState().following).toBe(true);
  });

  it("hält an, wenn ein live verfolgtes Match endet", () => {
    const controller = new ArenaController(map, meta("running"));
    controller.append(frames, 0);
    controller.setMeta(meta("finished"));
    for (let now = 0; now <= 2000; now += 100) controller.advance(now);
    expect(controller.getState()).toMatchObject({ tick: 5, playing: false, following: false, atEnd: true });
  });

  it("verlässt beim Spulen die Live-Verfolgung und kehrt mit goLive zurück", () => {
    const controller = new ArenaController(map, meta("running"));
    controller.append(frames, 0);
    controller.seek(1.5);
    expect(controller.getState()).toMatchObject({ tick: 1, following: false, playing: true });
    controller.step(-1);
    expect(controller.getState()).toMatchObject({ tick: 0, playing: false });
    controller.step(1);
    expect(controller.pos).toBe(1);
    controller.goLive();
    expect(controller.getState()).toMatchObject({ following: true, playing: true, speed: 1 });
    expect(controller.pos).toBe(4);
  });

  it("springt nach vorn, wenn im Live-Betrieb viele Frames auf einmal kommen", () => {
    const controller = new ArenaController(map, meta("running"));
    const many: Frame[] = Array.from({ length: 20 }, (_, t) => ({ ...frames[0], t }));
    controller.append(many, 0);
    expect(controller.pos).toBe(18);
  });

  it("meldet Zuhörern nur Änderungen des sichtbaren Zustands", () => {
    const controller = new ArenaController(map, meta("finished"));
    controller.append(frames, 0);
    let calls = 0;
    controller.subscribe(() => calls++);
    controller.advance(0);
    controller.advance(10);
    controller.advance(20);
    expect(calls).toBe(0);
    controller.advance(120);
    expect(calls).toBe(1);
  });
});

describe("Adapter auf das Server-Format", () => {
  const gameMap = generateMap({ seed: 11, planets: 24 });
  const simulation = simulate({
    map: gameMap,
    bots: [getBuiltinBot(DEMO_BOTS[0])!.play, getBuiltinBot(DEMO_BOTS[1])!.play],
    tickLimit: 200,
  });
  const file = replayFile({
    id: "sim",
    map: gameMap,
    frames: simulation.frames,
    result: simulation.result,
    names: ["Eins", "Zwei"],
    bots: [DEMO_BOTS[0], DEMO_BOTS[1]],
    options: { tickLimit: 200 },
  });

  it("kommt bei Schiffen, Produktion und Planeten auf dieselben Summen wie die Engine", () => {
    const buffer = new ReplayBuffer(toMap(file.map));
    for (const frame of file.frames) expect(buffer.append(toFrame(frame))).toBe(true);
    expect(buffer.lastTick).toBe(file.frames.length - 1);
    file.frames.forEach((frame, t) => {
      const stats = buffer.stats[t];
      expect(stats.ships, `Schiffe in Tick ${t}`).toEqual([frame.players[0].ships, frame.players[1].ships]);
      expect(stats.production).toEqual([frame.players[0].growth, frame.players[1].growth]);
      expect(stats.planets).toEqual([frame.players[0].planets, frame.players[1].planets]);
      expect(Math.min(...stats.inFlight)).toBeGreaterThanOrEqual(0);
    });
    expect(buffer.captures.length).toBeGreaterThan(0);
  });

  it("übersetzt Besitzer, Flotten und Ergebnis", () => {
    const first = toFrame(file.frames[0]);
    expect(first.planets[file.map.homes[0]]).toEqual({ owner: 1, ships: file.map.initial[file.map.homes[0]][1] });
    expect(first.planets[file.map.homes[1]].owner).toBe(2);
    const launched = file.frames.find((frame) => frame.launches.length > 0)!;
    const fleet = toFrame(launched).launches[0];
    expect(fleet.launch).toBe(launched.t - 1);
    expect(fleet.owner).toBe(launched.launches[0].owner + 1);
    const meta = toMeta(file.match);
    expect(meta.status).toBe("finished");
    expect(meta.players[0]).toMatchObject({ name: "Eins", builtIn: true, joined: true });
    expect(meta.result?.winner).toBe(simulation.result.winner === null ? 0 : simulation.result.winner + 1);
  });

  it("vertauscht mit flip beide Seiten vollständig", () => {
    const plain = new ReplayBuffer(toMap(file.map));
    const flipped = new ReplayBuffer(toMap(file.map));
    for (const frame of file.frames) {
      plain.append(toFrame(frame));
      flipped.append(toFrame(frame, true));
    }
    plain.stats.forEach((stats, t) => {
      expect(flipped.stats[t].ships).toEqual([stats.ships[1], stats.ships[0]]);
      expect(flipped.stats[t].production).toEqual([stats.production[1], stats.production[0]]);
      expect(flipped.stats[t].inFlight).toEqual([stats.inFlight[1], stats.inFlight[0]]);
    });
    expect(flipped.events.flat().map((event) => event.kind)).toEqual(plain.events.flat().map((event) => event.kind));
    const meta = toMeta(file.match, true);
    expect(meta.players.map((player) => player.name)).toEqual(["Zwei", "Eins"]);
    const winner = simulation.result.winner;
    expect(meta.result?.winner).toBe(winner === null ? 0 : 2 - winner);
    expect(toFrame(file.frames[5], true).seats).toHaveLength(2);
  });

  it("nimmt eine echte Replay-Datei an und lehnt kaputte mit Begründung ab", () => {
    const copy = JSON.parse(JSON.stringify(file));
    expect(parseReplayFile(copy).frames.length).toBe(file.frames.length);
    expect(() => parseReplayFile({ ...copy, format: "anders" })).toThrow(/format/);
    expect(() => parseReplayFile({ ...copy, frames: copy.frames.slice(1) })).toThrow(/Frame 0/);
    expect(() => parseReplayFile(null)).toThrow(/kein JSON-Objekt/);
    const broken = JSON.parse(JSON.stringify(file));
    broken.frames[2].planets.pop();
    expect(() => parseReplayFile(broken)).toThrow(/Frame 2/);
  });
});
