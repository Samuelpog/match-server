import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMap } from "@/lib/game";
import { ARENA_LIMITS, Arena } from "./arena";
import { ArenaError } from "./errors";
import { SERIES_LIMITS, SeriesManager } from "./series";

let arena: Arena;
let manager: SeriesManager;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
  arena = new Arena();
  manager = new SeriesManager(arena);
});

afterEach(() => {
  manager.shutdown();
  arena.shutdown();
  vi.useRealTimers();
});

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof ArenaError) return error.code;
    throw error;
  }
  return "kein Fehler";
}

const FAST = { roundMs: 100, rounds: 120, seed: 100 };
/** Lässt ein Spiel sicher zu Ende laufen. */
const GAME_MS = 120 * 100 + 10;

/** Spult in kleinen Schritten vor, bis das laufende Spiel der Serie vorbei ist. */
function finishCurrentGame(series: { games: { matchId: string }[] }) {
  const match = arena.getMatch(series.games.at(-1)!.matchId);
  for (let step = 0; step < 400 && match.status === "running"; step++) vi.advanceTimersByTime(100);
  expect(match.status).toBe("finished");
}

describe("Serie zwischen eingebauten Bots", () => {
  it("endet vorzeitig, sobald einer die Mehrheit der Spiele hat", () => {
    const series = manager.create({
      bestOf: 3,
      players: [{ type: "bot", bot: "standard" }, { type: "bot", bot: "passiv" }],
      options: FAST,
      label: "Test",
    });
    expect(series.status).toBe("running");
    expect(series.games).toHaveLength(1);

    finishCurrentGame(series);
    expect(series.wins).toEqual([1, 0]);
    expect(series.status).toBe("running");
    expect(manager.info(series).current).toBeNull();

    // Zwischen zwei Spielen liegt eine Pause.
    vi.advanceTimersByTime(SERIES_LIMITS.pauseMs - 1);
    expect(series.games).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(series.games).toHaveLength(2);
    expect(manager.info(series).current).toBe(series.games[1].matchId);

    finishCurrentGame(series);
    vi.advanceTimersByTime(60_000);
    const info = manager.info(series);
    expect(info.status).toBe("finished");
    expect(info.wins).toEqual([2, 0]);
    expect(info.winner).toBe(0);
    expect(info.games).toHaveLength(2);
    expect(info.current).toBeNull();
  });

  it("wechselt die Sitze und nimmt je Spiel eine neue Karte", () => {
    const series = manager.create({
      bestOf: 3,
      players: [{ type: "bot", bot: "standard" }, { type: "bot", bot: "passiv" }],
      options: FAST,
      label: "Finale",
    });
    finishCurrentGame(series);
    vi.advanceTimersByTime(SERIES_LIMITS.pauseMs);
    const [first, second] = series.games.map((game) => arena.getMatch(game.matchId));
    expect(series.games.map((game) => game.seats)).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(first.options.seed).toBe(100);
    expect(second.options.seed).toBe(101);
    expect(second.map).toEqual(generateMap({ seed: 101, planets: 15 }));
    expect(arena.info(first).players.map((player) => player.name)).toEqual(["Standard", "Passiv"]);
    expect(arena.info(second).players.map((player) => player.name)).toEqual(["Passiv", "Standard"]);
    expect(arena.info(second).series).toEqual({ id: series.id, game: 2 });
    expect(arena.info(second).label).toBe("Finale · Spiel 2");

    finishCurrentGame(series);
    // Im zweiten Spiel sitzt "standard" auf Sitz 1 und gewinnt dort: der Sieg zählt für Teilnehmer 0.
    expect(second.result?.winner).toBe(1);
    expect(manager.info(series).games[1].winner).toBe(0);
  });

  it("zählt Unentschieden als gespieltes Spiel ohne Sieger", () => {
    const series = manager.create({
      bestOf: 1,
      players: [{ type: "bot", bot: "passiv" }, { type: "bot", bot: "passiv" }],
      options: { ...FAST, rounds: 20 },
    });
    vi.advanceTimersByTime(20 * 100 + 10);
    expect(manager.info(series)).toMatchObject({ status: "finished", wins: [0, 0], draws: 1, winner: null });
  });

  it("spielt bei Unentschieden alle Spiele und entscheidet dann nach Siegen", () => {
    const series = manager.create({ bestOf: 3, demo: true, options: { ...FAST, rounds: 20 } });
    for (let game = 0; game < 3; game++) vi.advanceTimersByTime(20 * 100 + 10 + SERIES_LIMITS.pauseMs);
    const info = manager.info(series);
    expect(info.status).toBe("finished");
    expect(info.games.length).toBeLessThanOrEqual(3);
    expect(info.wins[0] + info.wins[1] + info.draws).toBe(info.games.length);
  });

  it("lehnt falsche Angaben ab", () => {
    expect(code(() => manager.create({ bestOf: 2 as never }))).toBe("bad_request");
    expect(code(() => manager.create({ players: [{ type: "bot", bot: "x" }, { type: "open" }] }))).toBe("unknown_bot");
    expect(code(() => manager.get("gibtsnicht"))).toBe("series_not_found");
  });
});

describe("Serie mit externen Bots", () => {
  function joined() {
    const series = manager.create({ bestOf: 3, options: { ...FAST, timeoutMs: 1000, rounds: 20 } });
    const a = manager.join(series.id, "Alpha");
    const b = manager.join(series.id, "Beta");
    return { series, a, b };
  }

  it("startet das erste Spiel, sobald beide beigetreten sind", () => {
    const series = manager.create({ bestOf: 3, options: FAST });
    expect(series.status).toBe("waiting");
    const a = manager.join(series.id, "Alpha");
    expect(a.slot).toBe(0);
    expect(series.games).toHaveLength(0);
    expect(manager.assignment(series, 0)).toBeNull();
    const b = manager.join(series.id, "Beta");
    expect(b.slot).toBe(1);
    expect(series.status).toBe("running");
    expect(manager.assignment(series, 0)).toEqual({ matchId: series.games[0].matchId, seat: 0 });
    expect(manager.assignment(series, 1)).toEqual({ matchId: series.games[0].matchId, seat: 1 });
    expect(code(() => manager.join(series.id, "Gamma"))).toBe("match_full");
    expect(manager.info(series).players.map((player) => player.name)).toEqual(["Alpha", "Beta"]);
  });

  it("lässt das Serien-Token in jedem Match der Serie gelten, mit wechselndem Sitz", () => {
    const { series, a, b } = joined();
    const first = series.games[0].matchId;
    expect(arena.authenticate(first, a.token).seat).toBe(0);
    expect(arena.authenticate(first, b.token).seat).toBe(1);
    expect(manager.authenticate(series.id, a.token).slot).toBe(0);
    expect(code(() => manager.authenticate(series.id, "falsch"))).toBe("unauthorized");

    // Niemand reicht ein: das Spiel läuft über Fristen bis zur letzten Runde und endet unentschieden.
    vi.advanceTimersByTime(ARENA_LIMITS.firstRoundGraceMs + 5 * 1000 + 20 * 100);
    expect(arena.getMatch(first).status).toBe("finished");
    vi.advanceTimersByTime(SERIES_LIMITS.pauseMs);
    const second = series.games[1].matchId;
    expect(second).not.toBe(first);
    expect(arena.authenticate(second, a.token).seat).toBe(1);
    expect(arena.authenticate(second, b.token).seat).toBe(0);
    expect(manager.playerState(series, 0).current).toEqual({ matchId: second, seat: 1 });
  });

  it("weckt wartende Bots, wenn das nächste Spiel beginnt", async () => {
    const { series } = joined();
    const first = series.games[0].matchId;
    let woke = false;
    void manager
      .wait(series, () => {
        const current = manager.assignment(series, 0);
        return current !== null && current.matchId !== first;
      }, 60_000)
      .then(() => (woke = true));
    await vi.advanceTimersByTimeAsync(ARENA_LIMITS.firstRoundGraceMs + 5 * 1000 + 20 * 100);
    expect(woke).toBe(false);
    await vi.advanceTimersByTimeAsync(SERIES_LIMITS.pauseMs);
    expect(woke).toBe(true);
  });

  it("bricht mit der Serie auch das laufende Match ab", () => {
    const { series } = joined();
    const first = series.games[0].matchId;
    manager.abort(series.id);
    expect(series.status).toBe("aborted");
    expect(arena.getMatch(first).status).toBe("aborted");
    expect(manager.info(series).current).toBeNull();
    expect(code(() => manager.abort(series.id))).toBe("already_over");
    vi.advanceTimersByTime(60_000);
    expect(series.games).toHaveLength(1);
  });

  it("endet, wenn jemand ein Spiel der Serie abbricht", () => {
    const { series } = joined();
    arena.abort(series.games[0].matchId);
    expect(series.status).toBe("aborted");
    vi.advanceTimersByTime(60_000);
    expect(series.games).toHaveLength(1);
  });

  it("versucht es erneut, wenn die Arena gerade voll ist", () => {
    for (let i = 0; i < ARENA_LIMITS.maxRunningMatches; i++) arena.createMatch({ demo: true, options: { roundMs: 100, seed: i } });
    const series = manager.create({ bestOf: 1, demo: true, options: FAST });
    expect(series.games).toHaveLength(0);
    expect(series.status).toBe("waiting");
    vi.advanceTimersByTime(SERIES_LIMITS.retryMs);
    expect(series.games).toHaveLength(0);
    // Sobald ein Platz frei ist, startet der nächste Versuch das Spiel.
    for (let step = 0; step < 400 && arena.runningCount() >= ARENA_LIMITS.maxRunningMatches; step++) vi.advanceTimersByTime(50);
    vi.advanceTimersByTime(SERIES_LIMITS.retryMs);
    expect(series.games).toHaveLength(1);
    vi.advanceTimersByTime(GAME_MS);
    expect(series.status).toBe("finished");
  });
});

describe("Verwaltung", () => {
  it("listet Serien, neueste zuerst", () => {
    const first = manager.create({ label: "eins" });
    vi.advanceTimersByTime(5);
    const second = manager.create({ label: "zwei" });
    expect(manager.list().map((series) => series.id)).toEqual([second.id, first.id]);
  });

  it("bricht eine Serie ab, der lange niemand beitritt", () => {
    const series = manager.create({});
    vi.advanceTimersByTime(ARENA_LIMITS.waitingTtlMs + 1);
    manager.list();
    expect(series.status).toBe("aborted");
  });
});
