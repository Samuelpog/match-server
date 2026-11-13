import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ReplayResponse } from "@/lib/arena/api-types-v2";
import { replayFile } from "@/lib/arena/replay-file-v2";
import { generateMap, getBuiltinBot, simulate } from "@/lib/game";
import { parseReplayFile, toFrame, toMap, toMeta } from "./adapter";
import { neutralPlanets, ReplayBuffer } from "./buffer";
import { ArenaController, VIEW_ROUND_MS } from "./controller";
import { defenseOf, share, type Frame, type MatchMeta } from "./model";
import { phaseOf, TIMING } from "./phases";
import { controllerFromReplay } from "./session";

const fixture = JSON.parse(readFileSync("fixtures/replay-v2-stufe1.json", "utf8")) as ReplayResponse;

/** Ein lokal gespieltes Match im Format des Servers. */
function played(seed: number, bots: [string, string] = ["standard", "sturm"], planets = 15): ReplayResponse {
  const map = generateMap({ seed, planets });
  const [a, b] = bots.map((id) => getBuiltinBot(id)!);
  const simulation = simulate({ map, bots: [a.play, b.play], rounds: 60 });
  return replayFile({ id: `test-${seed}`, map, frames: simulation.frames, result: simulation.result, names: [a.name, b.name] });
}

function bufferOf(replay: ReplayResponse, flip = false): ReplayBuffer {
  const buffer = new ReplayBuffer(toMap(replay.map, flip));
  for (const frame of replay.frames) expect(buffer.append(toFrame(frame, flip))).toBe(true);
  return buffer;
}

describe("Replay-Datei", () => {
  it("nimmt das Beispiel-Replay von Agent-A an", () => {
    expect(() => parseReplayFile(fixture)).not.toThrow();
    expect(parseReplayFile(fixture).frames.length).toBe(73);
  });

  it("erklärt, warum eine Datei des alten Spiels nicht mehr geht", () => {
    expect(() => parseReplayFile({ format: "planetwars-replay", version: 1 })).toThrow(/alten Planet Wars/);
  });

  it("lehnt Unlesbares mit einem Grund ab", () => {
    expect(() => parseReplayFile(null)).toThrow(/kein JSON-Objekt/);
    expect(() => parseReplayFile({ format: "etwas" })).toThrow(/format/);
    expect(() => parseReplayFile({ ...fixture, version: 3 })).toThrow(/Version 3/);
    expect(() => parseReplayFile({ ...fixture, frames: [] })).toThrow(/keine Frames/);
    expect(() => parseReplayFile({ ...fixture, frames: fixture.frames.slice(1) })).toThrow(/Frame 0/);
    expect(() => parseReplayFile({ ...fixture, map: { ...fixture.map, routes: [[0, 99, 1]] } })).toThrow(/Route/);
    const broken = structuredClone(fixture);
    broken.frames[5].planets.pop();
    expect(() => parseReplayFile(broken)).toThrow(/Frame 5 passt nicht zur Karte/);
    const noParams = structuredClone(fixture) as unknown as { match: Record<string, unknown> };
    delete noParams.match.params;
    expect(() => parseReplayFile(noParams)).toThrow(/Zahlenwerte/);
  });
});

describe("Adapter", () => {
  it("übersetzt Karte, Kopf und Frames", () => {
    const map = toMap(fixture.map);
    expect(map.planets).toHaveLength(15);
    expect(map.planets[0]).toMatchObject({ name: "Alphard", home: 1, hub: false });
    expect(map.planets[1].home).toBe(2);
    expect(map.planets.filter((planet) => planet.hub)).toHaveLength(3);
    expect(map.routes.every((route) => route.a < route.b && route.length >= 1 && route.length <= 3)).toBe(true);

    const meta = toMeta(fixture.match);
    expect(meta).toMatchObject({ rules: "rundenstrategie/1.0", rounds: 120, roundMs: 8000, status: "finished" });
    expect(meta.params.homeGuard).toBe(15);
    expect(meta.result).toEqual({ winner: 1, reason: "home" });
    expect(meta.players[0].name).toBe("Standard");

    const start = toFrame(fixture.frames[0]);
    expect(start.planets[0]).toMatchObject({ owner: 1, ships: 30 });
    expect(start.planets[2].owner).toBe(0);
    expect(start.seats[0].submitted).toBeNull();
  });

  it("liest Aktionen, auch abgelehnte und unlesbare", () => {
    const round4 = toFrame(fixture.frames[4]);
    const rejected = round4.actions[1].find((action) => !action.ok);
    expect(rejected).toMatchObject({ ok: false, code: "not_owner" });
    const moves = toFrame(fixture.frames[1]).actions[0];
    expect(moves.length).toBeGreaterThan(0);
    expect(moves[0]).toMatchObject({ ok: true, kind: "move", code: null });
    expect(moves[0].fleet).not.toBeNull();

    const odd = structuredClone(fixture.frames[1]);
    odd.actions[0] = [{ action: "Unsinn", ok: false, code: "bad_action" }, { action: null, ok: false }];
    const shown = toFrame(odd).actions[0];
    expect(shown[0]).toMatchObject({ kind: "other", ok: false, code: "bad_action", from: null, to: null });
    expect(shown[1]).toMatchObject({ kind: "other", code: "bad_action" });
  });

  it("vertauscht mit `flip` beide Seiten vollständig", () => {
    const straight = fixture.frames.map((frame) => toFrame(frame));
    const flipped = fixture.frames.map((frame) => toFrame(frame, true));
    const swap = (owner: number) => (owner === 0 ? 0 : 3 - owner);
    straight.forEach((frame, round) => {
      const other = flipped[round];
      expect(other.seats).toEqual([frame.seats[1], frame.seats[0]]);
      expect(other.actions).toEqual([frame.actions[1], frame.actions[0]]);
      expect(other.planets.map((planet) => planet.owner)).toEqual(frame.planets.map((planet) => swap(planet.owner)));
      expect(other.fleets.map((fleet) => fleet.owner)).toEqual(frame.fleets.map((fleet) => swap(fleet.owner)));
      frame.events.forEach((event, index) => {
        const mirrored = other.events[index];
        if (event.kind === "route" && mirrored.kind === "route") {
          expect(mirrored.fleets.map((fleet) => fleet.owner)).toEqual(event.fleets.map((fleet) => swap(fleet.owner)));
        } else if (event.kind !== "route" && event.kind !== "built" && mirrored.kind !== "route" && mirrored.kind !== "built") {
          expect(mirrored.arrived).toEqual([event.arrived[1], event.arrived[0]]);
          expect(mirrored.after.owner).toBe(swap(event.after.owner));
        }
      });
    });
    expect(toMap(fixture.map, true).planets[0].home).toBe(2);
    expect(toMeta(fixture.match, true).result).toEqual({ winner: 2, reason: "home" });
    expect(toMeta(fixture.match, true).players[0].name).toBe("Sturm");
  });
});

/** Prüft, dass der aufbereitete Ablauf jeder Runde genau von einem Frame zum nächsten führt. */
function expectConsistent(buffer: ReplayBuffer): void {
  for (let round = 1; round <= buffer.lastRound; round++) {
    const previous = buffer.frames[round - 1];
    const frame = buffer.frames[round];
    const transition = buffer.transitions[round]!;
    const tracks = new Map(transition.tracks.map((track) => [track.id, track]));
    const arrived = new Set(transition.planetEvents.flatMap((event) => event.fleets));
    const where = `Runde ${round}`;

    // Jede Flotte von vorher hat einen Weg: Sie fliegt weiter, kommt an oder wird vernichtet.
    for (const fleet of previous.fleets) {
      const track = tracks.get(fleet.id);
      expect(track, `${where}, Flotte ${fleet.id}`).toBeDefined();
      const survives = frame.fleets.some((next) => next.id === fleet.id);
      expect(survives || arrived.has(fleet.id) || track!.shipsAfter === 0, `${where}, Flotte ${fleet.id} verschwindet ohne Grund`).toBe(true);
    }
    // Jede Flotte von nachher endet dort, wo ihr Weg endet, mit so vielen Schiffen, wie der Weg sagt.
    for (const fleet of frame.fleets) {
      const track = tracks.get(fleet.id)!;
      expect(track, `${where}, Flotte ${fleet.id}`).toBeDefined();
      expect(track.end, `${where}, Flotte ${fleet.id}`).toBe(fleet.progress);
      expect(track.shipsAfter).toBe(fleet.ships);
      expect(track.arrives).toBe(false);
    }
    for (const track of transition.tracks) {
      expect(track.start).toBeGreaterThanOrEqual(0);
      expect(track.end).toBeLessThanOrEqual(track.length);
      if (track.arrives) expect(track.end).toBe(track.length);
      if (track.launched) expect(track.start).toBe(0);
      // Ein Kampf auf der Route liegt auf dem Stück, das die Flotte in dieser Runde fliegt.
      for (const battle of track.battles) {
        expect(battle.at, `${where}, Flotte ${track.id}`).toBeGreaterThanOrEqual(track.start);
        expect(battle.at).toBeLessThanOrEqual(Math.max(track.end, track.start + 1));
      }
    }
    // Kein Planet schickt mehr los, als er hat.
    for (const [planet, ships] of transition.launched) {
      expect(ships, `${where}, Planet ${planet}`).toBeLessThanOrEqual(previous.planets[planet].ships);
    }
    // Angekommene Schiffe stimmen mit den Wegen überein.
    for (const event of transition.planetEvents) {
      const sum: [number, number] = [0, 0];
      for (const id of event.fleets) {
        const track = tracks.get(id)!;
        sum[track.owner - 1] += track.shipsAfter;
        expect(track.to).toBe(event.planet);
      }
      expect(sum, `${where}, Planet ${event.planet}`).toEqual(event.arrived);
      expect(frame.planets[event.planet].owner).toBe(event.after.owner);
    }
  }
}

describe("Puffer und Rundenablauf", () => {
  it("führt im Beispiel-Replay jede Runde lückenlos zum nächsten Frame", () => {
    const buffer = bufferOf(fixture);
    expect(buffer.lastRound).toBe(72);
    expect(buffer.transitions[0]).toBeNull();
    expectConsistent(buffer);
  });

  it("tut das auch für frisch gespielte Matches, gerade und vertauscht", () => {
    for (const seed of [1, 7, 42, 207, 999]) {
      expectConsistent(bufferOf(played(seed)));
      expectConsistent(bufferOf(played(seed, ["sturm", "standard"], 17), true));
    }
  });

  it("kennt die Kämpfe des Beispiel-Replays", () => {
    const buffer = bufferOf(fixture);
    const mid = buffer.transitions[53]!.routeBattles[0];
    expect(mid.at).toBe(1.5);
    // Beide Flotten treffen sich am selben Punkt, jede von ihrer Seite gemessen.
    const fighters = mid.fleets.map((fleet) => buffer.transitions[53]!.tracks.find((track) => track.id === fleet.id)!);
    expect(fighters).toHaveLength(2);
    const fromA = fighters.map((track) => (track.from === mid.a ? track.battles[0].at : track.length - track.battles[0].at));
    expect(fromA).toEqual([1.5, 1.5]);

    // Ausfall direkt vor dem Planeten: Die neue Flotte kämpft, bevor sie sich bewegt.
    const sally = buffer.transitions[46]!;
    expect(sally.routeBattles[0].at).toBe(0);
    expect(sally.tracks.some((track) => track.launched && track.battles.length === 1 && track.battles[0].at === 0)).toBe(true);

    expect(buffer.captures.length).toBeGreaterThan(5);
    // Die letzte Runde bringt den Heimatsieg: Planet 1 ist die Heimat von Spieler 2.
    expect(buffer.captures.some((event) => event.round === 72 && event.planet === 1 && event.after.owner === 1)).toBe(true);
  });

  it("zieht Baukosten sofort ab und kennt Baustellen (Stufe 2)", () => {
    const replay = structuredClone(fixture);
    replay.match.params.buildings = { fortress: { cost: 15, time: 3, hubOnly: false } };
    replay.frames[20].actions[0].push({ action: { type: "build", planet: 0, building: "fortress" }, ok: true });
    replay.frames[20].actions[1].push({ action: { type: "build", planet: 5, building: "command" }, ok: false, code: "not_hub" });
    for (let round = 20; round < replay.frames.length; round++) {
      replay.frames[round].planets[0].building = { type: "fortress", ready: 23 };
    }
    replay.frames[23].events.push({ step: "build", kind: "completed", planet: 0, building: "fortress" });

    const controller = controllerFromReplay(replay);
    const { buffer } = controller;
    const begin = buffer.transitions[20]!;
    expect(begin.started.has(0)).toBe(true);
    // Die abgelehnte Aktion beginnt keinen Bau und kostet nichts.
    expect(begin.started.has(5)).toBe(false);
    const moved = fixture.frames[20].actions[0]
      .filter((record) => record.ok && (record.action as { from?: number }).from === 0)
      .reduce((sum, record) => sum + (record.action as { ships: number }).ships, 0);
    expect(begin.launched.get(0)).toBe(moved + 15);
    expect(buffer.transitions[23]!.built).toEqual([{ kind: "built", round: 23, planet: 0, building: "fortress" }]);
    expect(buffer.frames[20].actions[0].at(-1)).toMatchObject({ kind: "build", from: 0, building: "fortress", ok: true });
    expect(buffer.frames[20].actions[1].at(-1)).toMatchObject({ kind: "build", ok: false, code: "not_hub" });
  });

  it("übergeht bekannte Runden und meldet Lücken", () => {
    const buffer = new ReplayBuffer(toMap(fixture.map));
    const frames = fixture.frames.map((frame) => toFrame(frame));
    expect(buffer.append(frames[0])).toBe(true);
    expect(buffer.append(frames[0])).toBe(true);
    expect(buffer.append(frames[2])).toBe(false);
    expect(buffer.lastRound).toBe(0);
    expect(buffer.append({ ...frames[1], planets: frames[1].planets.slice(1) })).toBe(false);
    expect(buffer.append(frames[1])).toBe(true);
    expect(buffer.frameAt(0.9)?.round).toBe(0);
    expect(buffer.frameAt(99)?.round).toBe(1);
    expect(buffer.lengthOf(11, 2)).toBe(buffer.lengthOf(2, 11));
  });

  it("zählt neutrale Planeten und rechnet Anteile", () => {
    expect(neutralPlanets(toFrame(fixture.frames[0]))).toBe(13);
    expect(share([3, 1])).toBe(0.75);
    expect(share([0, 0])).toBe(0.5);
  });

  it("rechnet die Verteidigung mit Heimatschutz und Festung", () => {
    const map = toMap(fixture.map);
    const params = toMeta(fixture.match).params;
    const home = map.planets[0];
    const state = { owner: 1 as const, ships: 20, building: null, supply: null };
    expect(defenseOf(home, state, 10, params)).toBe(35);
    // Der Heimatschutz gilt nur für den Spieler, dessen Heimat es ist.
    expect(defenseOf(home, { ...state, owner: 2 }, 10, params)).toBe(20);
    expect(defenseOf(map.planets[2], state, 10, params)).toBe(20);
    const fortified = { ...state, building: { type: "fortress" as const, ready: 8 } };
    expect(defenseOf(home, fortified, 10, params)).toBe(45);
    // Eine Festung im Bau zählt noch nicht.
    expect(defenseOf(home, { ...fortified, building: { type: "fortress", ready: 12 } }, 10, params)).toBe(35);
  });
});

describe("Zeitplan einer Runde", () => {
  it("ordnet jeden Moment einem Schritt zu, in der Reihenfolge der Regeln", () => {
    expect(phaseOf(0)).toBe("orders");
    expect(phaseOf(TIMING.moveFrom)).toBe("move");
    expect(phaseOf(TIMING.routeHit)).toBe("fight");
    expect(phaseOf(TIMING.arriveHit)).toBe("fight");
    expect(phaseOf(0.95)).toBe("result");
    const order = [
      TIMING.launchFrom,
      TIMING.launchTo,
      TIMING.moveFrom,
      TIMING.moveTo,
      TIMING.routeHit,
      TIMING.routeSettle,
      TIMING.resumeFrom,
      TIMING.resumeTo,
      TIMING.arriveHit,
      TIMING.planetSettle,
      TIMING.production,
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("Abspielkopf", () => {
  const running: MatchMeta = { ...toMeta(fixture.match), status: "running", result: null };
  const frames: Frame[] = fixture.frames.map((frame) => toFrame(frame));

  function live(count: number): ArenaController {
    const controller = new ArenaController(toMap(fixture.map), running);
    controller.append(frames.slice(0, count), 0);
    return controller;
  }

  it("spielt ein beendetes Match als Replay von vorn, im festen Schautempo", () => {
    const controller = controllerFromReplay(fixture);
    expect(controller.getState()).toMatchObject({ round: 0, showing: 0, lastRound: 72, playing: true, following: false, atEnd: false });
    // Der Abspielkopf rückt je Bild höchstens eine Viertelsekunde vor, also in kleinen Schritten.
    const run = (from: number, to: number) => {
      for (let now = from; now <= to; now += 50) controller.advance(now);
    };
    run(1000, 1000 + VIEW_ROUND_MS / 2);
    expect(controller.pos).toBeCloseTo(0.5);
    expect(controller.getState()).toMatchObject({ round: 0, showing: 1 });
    controller.setSpeed(2);
    run(1000 + VIEW_ROUND_MS / 2, 1000 + VIEW_ROUND_MS);
    expect(controller.pos).toBeCloseTo(1.5);
    // Die Dauer hängt nicht davon ab, wie schnell das Match gespielt wurde.
    expect(controller.meta.roundMs).toBe(8000);
    expect(controller.roundViewMs).toBe(VIEW_ROUND_MS / 2);
  });

  it("bleibt am Ende stehen und beginnt beim Abspielen von vorn", () => {
    const controller = controllerFromReplay(fixture);
    controller.seek(71.9);
    controller.advance(0);
    for (let now = 100; now <= 3000; now += 100) controller.advance(now);
    expect(controller.getState()).toMatchObject({ round: 72, showing: 72, playing: false, atEnd: true });
    controller.play();
    expect(controller.pos).toBe(0);
  });

  it("geht rundenweise vor und zurück, auch mitten in einer Auflösung", () => {
    const controller = controllerFromReplay(fixture);
    controller.seek(10);
    controller.step(1);
    expect(controller.pos).toBe(11);
    controller.step(-1);
    expect(controller.pos).toBe(10);
    controller.seek(10.4);
    controller.step(-1);
    // Zurück an den Anfang der laufenden Auflösung, nicht eine ganze Runde davor.
    expect(controller.pos).toBe(10);
    controller.seek(10.4);
    controller.step(1);
    expect(controller.pos).toBe(11);
    expect(controller.getState().playing).toBe(false);
    controller.step(-99);
    expect(controller.pos).toBe(0);
  });

  it("folgt einem laufenden Match und zeigt jede neue Runde in voller Länge", () => {
    const controller = live(3);
    expect(controller.getState()).toMatchObject({ following: true, lastRound: 2 });
    controller.advance(0);
    for (let now = 50; now <= 20_000; now += 50) controller.advance(now);
    expect(controller.pos).toBe(2);
    expect(controller.getState()).toMatchObject({ playing: true, following: true, atEnd: false });

    controller.append([frames[3]], 20_000);
    controller.advance(20_050);
    controller.advance(20_100);
    expect(controller.pos).toBeGreaterThan(2);
    expect(controller.pos).toBeLessThan(2.1);
    expect(controller.getState()).toMatchObject({ round: 2, showing: 3 });
    // Länger als zweieinhalb Sekunden dauert die Auflösung auch bei acht Sekunden je Runde nicht.
    expect(controller.roundViewMs).toBeLessThanOrEqual(2500);
    for (let now = 20_150; now <= 26_000; now += 50) controller.advance(now);
    expect(controller.pos).toBe(3);
  });

  it("springt bei großem Rückstand, statt alles nachzuspielen", () => {
    const controller = live(2);
    controller.advance(0);
    controller.append(frames.slice(2, 30), 100);
    expect(controller.pos).toBe(28);
  });

  it("verlässt beim Zurückspulen den Live-Stand und kehrt auf Wunsch zurück", () => {
    const controller = live(20);
    controller.seek(5);
    expect(controller.getState().following).toBe(false);
    controller.goLive();
    expect(controller.getState()).toMatchObject({ following: true, playing: true, speed: 1 });
    expect(controller.pos).toBe(18);
  });

  it("hört am Ende eines live verfolgten Matches auf zu spielen", () => {
    const controller = live(72);
    controller.append([frames[72]], 0);
    controller.setMeta(toMeta(fixture.match));
    controller.advance(0);
    for (let now = 100; now <= 30_000; now += 100) controller.advance(now);
    expect(controller.getState()).toMatchObject({ round: 72, playing: false, following: false, atEnd: true });
  });

  it("meldet Änderungen am Kopf und an der Runde, nicht jedes Bild", () => {
    const controller = controllerFromReplay(fixture);
    let calls = 0;
    controller.subscribe(() => (calls += 1));
    controller.advance(0);
    for (let now = 16; now <= VIEW_ROUND_MS * 0.9; now += 16) controller.advance(now);
    // Vom Stand der Runde 0 in die Auflösung der Runde 1: genau eine Meldung.
    expect(calls).toBe(1);
    const version = controller.getMetaVersion();
    controller.setMeta(controller.meta);
    expect(controller.getMetaVersion()).toBe(version + 1);
  });
});
