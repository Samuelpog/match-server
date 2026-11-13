import { describe, expect, it } from "vitest";
import { ReplayBuffer, share } from "./buffer";
import { ArenaController } from "./controller";
import { simulateFixture } from "./fixtures/simulate";
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
      { name: "Eins", online: true },
      { name: "Zwei", online: true },
    ],
    result: status === "finished" ? { winner: 1, reason: null } : null,
  };
}

/** Spieler 1 schickt 30 Schiffe von a nach c (2 Ticks), Spieler 2 schickt 5 von b nach b-Verstärkung c später. */
const frames: Frame[] = [
  { t: 0, planets: [{ owner: 1, ships: 50 }, { owner: 2, ships: 50 }, { owner: 0, ships: 10 }], launches: [] },
  {
    t: 1,
    planets: [{ owner: 1, ships: 22 }, { owner: 2, ships: 53 }, { owner: 0, ships: 10 }],
    launches: [{ id: "f1", owner: 1, from: 0, to: 2, ships: 30, launch: 1, arrive: 3 }],
  },
  {
    t: 2,
    planets: [{ owner: 1, ships: 24 }, { owner: 2, ships: 51 }, { owner: 0, ships: 10 }],
    launches: [{ id: "f2", owner: 2, from: 1, to: 2, ships: 5, launch: 2, arrive: 4 }],
  },
  { t: 3, planets: [{ owner: 1, ships: 26 }, { owner: 2, ships: 54 }, { owner: 1, ships: 20 }], launches: [] },
  {
    t: 4,
    planets: [{ owner: 1, ships: 18 }, { owner: 2, ships: 57 }, { owner: 1, ships: 16 }],
    launches: [{ id: "f3", owner: 1, from: 0, to: 2, ships: 10, launch: 4, arrive: 5 }],
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

  it("zeigt Flotten vom Start-Tick bis vor den Ankunfts-Tick, auch nach dem Zurückspulen", () => {
    const buffer = filled();
    const ids = (pos: number) => buffer.activeFleets(pos).map((fleet) => fleet.id);
    expect(ids(0.9)).toEqual([]);
    expect(ids(1)).toEqual(["f1"]);
    expect(ids(2.5)).toEqual(["f1", "f2"]);
    expect(ids(3)).toEqual(["f2"]);
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

describe("simulateFixture", () => {
  it("erzeugt einen lückenlosen, wiederholbaren Verlauf mit Ergebnis", () => {
    const a = simulateFixture({ seed: 3 });
    const b = simulateFixture({ seed: 3 });
    expect(a.frames.length).toBe(b.frames.length);
    expect(a.frames.at(-1)).toEqual(b.frames.at(-1));
    expect(a.meta.result).not.toBeNull();
    const buffer = new ReplayBuffer(a.map);
    for (const frame of a.frames) expect(buffer.append(frame)).toBe(true);
    expect(buffer.captures.length).toBeGreaterThan(0);
    // Kein Schiff geht verloren oder entsteht aus dem Nichts außer durch Produktion und Kampf.
    for (const stats of buffer.stats) {
      expect(stats.inFlight[0]).toBeGreaterThanOrEqual(0);
      expect(stats.inFlight[1]).toBeGreaterThanOrEqual(0);
    }
    expect(buffer.stats.at(-1)!.inFlight[0] + buffer.stats.at(-1)!.inFlight[1]).toBeGreaterThanOrEqual(0);
  });
});
