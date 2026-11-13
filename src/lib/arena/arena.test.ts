import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RULES, generateMap, getBuiltinBot, neighbors, simulate } from "@/lib/game";
import { ARENA_LIMITS, Arena, normalizeOptions } from "./arena";
import { ArenaError } from "./errors";

let arena: Arena;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
  arena = new Arena();
});

afterEach(() => {
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

/** Legt ein Match mit zwei externen Bots an und lässt beide beitreten. */
function twoExternal(options = {}) {
  const match = arena.createMatch({ options: { seed: 7, roundMs: 100, timeoutMs: 1000, rounds: 50, ...options } });
  const a = arena.join(match.id, "Alpha");
  const b = arena.join(match.id, "Beta");
  return { match, a, b };
}

/** Ein gültiger Zug: zehn Schiffe vom Heimatplaneten des Sitzes zu seinem ersten Nachbarn. */
function firstMove(match: { map: Parameters<typeof neighbors>[0] }, seat: 0 | 1) {
  const from = match.map.homes[seat];
  return { type: "move", from, to: neighbors(match.map)[from][0].planet, ships: 10 };
}

describe("Einstellungen", () => {
  it("füllt Standardwerte und zieht einen zufälligen Seed", () => {
    const options = normalizeOptions(undefined);
    expect(options).toMatchObject({ planets: 15, rounds: 120, roundMs: 8000, timeoutMs: 5000 });
    expect(Number.isInteger(options.seed)).toBe(true);
  });

  it("lehnt Werte außerhalb der Bereiche ab", () => {
    expect(code(() => normalizeOptions({ planets: 16 }))).toBe("bad_request");
    expect(code(() => normalizeOptions({ planets: 24 }))).toBe("bad_request");
    expect(code(() => normalizeOptions({ rounds: 5 }))).toBe("bad_request");
    expect(code(() => normalizeOptions({ roundMs: 10 }))).toBe("bad_request");
    expect(code(() => normalizeOptions({ seed: -1 }))).toBe("bad_request");
    expect(code(() => normalizeOptions({ seed: "abc" }))).toBe("bad_request");
    expect(code(() => normalizeOptions([]))).toBe("bad_request");
    expect(normalizeOptions({ planets: 17 }).planets).toBe(17);
  });

  it("weist die Optionen des alten Spiels mit einem Hinweis zurück", () => {
    expect(code(() => normalizeOptions({ tickMs: 300 }))).toBe("bad_request");
    expect(code(() => normalizeOptions({ tickLimit: 300 }))).toBe("bad_request");
  });

  it("erlaubt eine Frist, die kürzer ist als die Runde", () => {
    expect(normalizeOptions({ roundMs: 8000, timeoutMs: 5000 })).toMatchObject({ roundMs: 8000, timeoutMs: 5000 });
  });
});

describe("Demo mit eingebauten Bots", () => {
  it("startet sofort, läuft im Takt und endet mit demselben Ergebnis wie die Simulation", () => {
    const match = arena.createMatch({ demo: true, options: { seed: 2026, roundMs: 100 } });
    expect(match.status).toBe("running");
    expect(match.frames).toHaveLength(1);

    vi.advanceTimersByTime(99);
    expect(match.state.round).toBe(0);
    vi.advanceTimersByTime(1);
    expect(match.state.round).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(match.state.round).toBe(11);

    vi.advanceTimersByTime(120 * 100);
    expect(match.status).toBe("finished");

    const expected = simulate({
      map: generateMap({ seed: 2026, planets: 15 }),
      bots: [getBuiltinBot("standard")!.play, getBuiltinBot("sturm")!.play],
      rounds: 120,
    });
    const core = ({ planets, fleets, events, actions }: (typeof expected.frames)[number]) => ({ planets, fleets, events, actions });
    expect(match.result).toEqual(expected.result);
    expect(match.frames.map(core)).toEqual(expected.frames.map(core));
    expect(match.frames.at(-1)!.at).toBe((match.frames.length - 1) * 100);
    expect(match.finishedAt).not.toBeNull();
  });

  it("kennt die Karte und Frame 0 schon vor dem Start", () => {
    const match = arena.createMatch({ options: { seed: 3 } });
    expect(match.status).toBe("waiting");
    const replay = arena.replay(match, 0);
    expect(replay.map).toEqual(generateMap({ seed: 3, planets: 15 }));
    expect(replay.frames).toHaveLength(1);
    expect(replay.frames[0].round).toBe(0);
    expect(replay.version).toBe(2);
    expect(replay.match).toMatchObject({ rules: RULES, round: 0, rounds: 120 });
    expect(replay.match.params.actions).toEqual({ base: 3, max: 5 });
    expect(replay.next).toBe(1);
    expect(replay.format).toBe("planetwars-replay");
  });

  it("lehnt unbekannte Bots und falsche Spielerlisten ab", () => {
    expect(code(() => arena.createMatch({ players: [{ type: "bot", bot: "gibtsnicht" }, { type: "open" }] }))).toBe(
      "unknown_bot",
    );
    expect(code(() => arena.createMatch({ players: [{ type: "open" }] as never }))).toBe("bad_request");
  });
});

describe("Beitreten", () => {
  it("vergibt die Sitze der Reihe nach und startet, wenn beide da sind", () => {
    const match = arena.createMatch({});
    const version = match.version;
    const a = arena.join(match.id, "  Alpha  ");
    expect(a.seat).toBe(0);
    expect(match.status).toBe("waiting");
    expect(match.version).toBeGreaterThan(version);
    const b = arena.join(match.id, undefined);
    expect(b.seat).toBe(1);
    expect(match.status).toBe("running");
    expect(a.token).not.toBe(b.token);
    const info = arena.info(match);
    expect(info.players.map((player) => player.name)).toEqual(["Alpha", "Spieler 2"]);
    expect(info.players.every((player) => player.joined && player.online)).toBe(true);
    expect(code(() => arena.join(match.id, "Gamma"))).toBe("match_full");
  });

  it("besetzt neben einem eingebauten Bot nur den offenen Platz", () => {
    const match = arena.createMatch({ players: [{ type: "bot", bot: "passiv" }, { type: "open" }] });
    expect(arena.join(match.id, "Solo").seat).toBe(1);
    expect(match.status).toBe("running");
  });

  it("erkennt Bots am Token", () => {
    const { match, a, b } = twoExternal();
    expect(arena.authenticate(match.id, a.token).seat).toBe(0);
    expect(arena.authenticate(match.id, b.token).seat).toBe(1);
    expect(code(() => arena.authenticate(match.id, "falsch"))).toBe("unauthorized");
    expect(code(() => arena.authenticate(match.id, null))).toBe("unauthorized");
    expect(code(() => arena.authenticate("gibtsnicht", a.token))).toBe("match_not_found");
  });
});

describe("Takt und Fristen", () => {
  it("löst auf, sobald beide eingereicht haben, aber nicht vor der Mindestdauer", () => {
    const { match } = twoExternal();
    arena.submitOrders(match, 0, 1, []);
    vi.advanceTimersByTime(50);
    arena.submitOrders(match, 1, 1, []);
    expect(match.state.round).toBe(0);
    vi.advanceTimersByTime(49);
    expect(match.state.round).toBe(0);
    vi.advanceTimersByTime(1);
    expect(match.state.round).toBe(1);
    expect(match.frames[1].players.map((player) => player.submitted)).toEqual([true, true]);
  });

  it("löst sofort auf, wenn der zweite nach der Mindestdauer einreicht", () => {
    const { match } = twoExternal();
    arena.submitOrders(match, 0, 1, []);
    vi.advanceTimersByTime(400);
    expect(match.state.round).toBe(0);
    arena.submitOrders(match, 1, 1, []);
    vi.advanceTimersByTime(0);
    expect(match.state.round).toBe(1);
    expect(match.frames[1].at).toBe(400);
  });

  it("gibt der ersten Runde mindestens fünf Sekunden und löst dann ohne den Säumigen auf", () => {
    const { match } = twoExternal();
    arena.submitOrders(match, 0, 1, [firstMove(match, 0)]);
    vi.advanceTimersByTime(ARENA_LIMITS.firstRoundGraceMs - 1);
    expect(match.state.round).toBe(0);
    vi.advanceTimersByTime(1);
    expect(match.state.round).toBe(1);
    expect(match.frames[1].players[0]).toMatchObject({ submitted: true, actions: { used: 1, limit: 3 } });
    expect(match.frames[1].players[1]).toMatchObject({ submitted: false, actions: { used: 0, limit: 3 } });
    expect(match.frames[1].fleets).toHaveLength(1);
  });

  it("wartet ab der zweiten Runde nur noch die normale Frist", () => {
    const { match } = twoExternal();
    vi.advanceTimersByTime(ARENA_LIMITS.firstRoundGraceMs);
    expect(match.state.round).toBe(1);
    vi.advanceTimersByTime(999);
    expect(match.state.round).toBe(1);
    vi.advanceTimersByTime(1);
    expect(match.state.round).toBe(2);
  });

  it("nimmt im Turniertakt nach der Frist nichts mehr an und löst erst nach der Rundendauer auf", () => {
    const { match } = twoExternal({ roundMs: 8000, timeoutMs: 5000 });
    arena.submitOrders(match, 0, 1, []);
    arena.submitOrders(match, 1, 1, []);
    vi.advanceTimersByTime(7999);
    expect(match.state.round).toBe(0);
    vi.advanceTimersByTime(1);
    expect(match.state.round).toBe(1);

    // Runde 2: Sitz 0 reicht rechtzeitig ein, Sitz 1 kommt nach der Frist.
    arena.submitOrders(match, 0, 2, []);
    expect(arena.playerState(match, 1).deadlineMs).toBe(5000);
    vi.advanceTimersByTime(5001);
    expect(code(() => arena.submitOrders(match, 1, 2, []))).toBe("too_late");
    expect(arena.playerState(match, 1).deadlineMs).toBe(0);
    vi.advanceTimersByTime(2998);
    expect(match.state.round).toBe(1);
    vi.advanceTimersByTime(1);
    expect(match.state.round).toBe(2);
    expect(match.frames[2].players.map((player) => player.submitted)).toEqual([true, false]);
  });

  it("wartet nach fünf verpassten Fristen nicht mehr auf einen Bot, bis er wieder einreicht", () => {
    const { match } = twoExternal();
    const play = () => arena.submitOrders(match, 0, match.state.round + 1, []);
    // Fünf Runden lang reicht nur Sitz 0 ein, jede kostet die volle Frist.
    play();
    vi.advanceTimersByTime(ARENA_LIMITS.firstRoundGraceMs);
    for (let i = 0; i < 4; i++) {
      play();
      vi.advanceTimersByTime(1000);
    }
    expect(match.state.round).toBe(5);
    expect(arena.info(match).players[1].absent).toBe(true);

    // Jetzt geht es im Takt weiter, ohne Frist.
    play();
    vi.advanceTimersByTime(100);
    expect(match.state.round).toBe(6);

    // Meldet sich der Bot zurück, wird wieder auf ihn gewartet.
    arena.submitOrders(match, 1, 7, []);
    expect(arena.info(match).players[1].absent).toBe(false);
    play();
    vi.advanceTimersByTime(100);
    expect(match.state.round).toBe(7);
    play();
    vi.advanceTimersByTime(999);
    expect(match.state.round).toBe(7);
    vi.advanceTimersByTime(1);
    expect(match.state.round).toBe(8);
  });

  it("läuft auch ohne jeden Bot bis zur letzten Runde durch und blockiert nie", () => {
    const { match } = twoExternal({ rounds: 30 });
    vi.advanceTimersByTime(ARENA_LIMITS.firstRoundGraceMs + 4 * 1000 + 30 * 100);
    expect(match.status).toBe("finished");
    expect(match.state.round).toBe(30);
    expect(match.result).toEqual({ winner: null, reason: "draw" });
  });

  it("lässt einen externen Bot gegen einen eingebauten spielen", () => {
    const match = arena.createMatch({
      players: [{ type: "open" }, { type: "bot", bot: "passiv" }],
      options: { seed: 5, roundMs: 100, timeoutMs: 1000, rounds: 40 },
    });
    arena.join(match.id, "Solo");
    arena.submitOrders(match, 0, 1, []);
    vi.advanceTimersByTime(100);
    expect(match.state.round).toBe(1);
    expect(match.frames[1].players[1].submitted).toBe(true);
  });
});

describe("Aktionen", () => {
  it("meldet angenommene und abgelehnte Aktionen sofort", () => {
    const { match } = twoExternal();
    const good = firstMove(match, 0);
    const answer = arena.submitOrders(match, 0, 1, [good, firstMove(match, 1)]);
    expect(answer.accepted).toBe(1);
    expect(answer.results).toEqual([
      { action: good, ok: true },
      { action: firstMove(match, 1), ok: false, code: "not_owner" },
    ]);
    expect(arena.playerState(match, 0).submitted).toBe(true);
    expect(arena.playerState(match, 1).submitted).toBe(false);
  });

  it("nimmt je Runde nur die erste Einreichung und keine für andere Runden", () => {
    const { match } = twoExternal();
    arena.submitOrders(match, 0, 1, []);
    expect(code(() => arena.submitOrders(match, 0, 1, []))).toBe("already_submitted");
    expect(code(() => arena.submitOrders(match, 1, 0, []))).toBe("stale_round");
    expect(code(() => arena.submitOrders(match, 1, 3, []))).toBe("stale_round");
    expect(code(() => arena.submitOrders(match, 1, "1", []))).toBe("bad_request");
    expect(code(() => arena.submitOrders(match, 1, 1, { from: 1 }))).toBe("bad_request");
  });

  it("nimmt nichts an, bevor das Match läuft oder nachdem es endet", () => {
    const match = arena.createMatch({});
    expect(code(() => arena.submitOrders(match, 0, 1, []))).toBe("match_not_running");
    const { match: other } = twoExternal();
    arena.abort(other.id);
    expect(code(() => arena.submitOrders(other, 0, 1, []))).toBe("match_not_running");
  });

  it("zeigt dem Bot Stand, Frist, Regeln und alle Flotten", () => {
    const { match } = twoExternal();
    const sent = firstMove(match, 0);
    arena.submitOrders(match, 0, 1, [sent]);
    arena.submitOrders(match, 1, 1, []);
    vi.advanceTimersByTime(100);
    const state = arena.playerState(match, 1);
    expect(state).toMatchObject({ you: 1, round: 2, rounds: 50, deadlineMs: 1000, rules: RULES, actions: { limit: 3 }, score: [4, 4] });
    expect(state.planets).toHaveLength(15);
    expect(state.planets[0]).toMatchObject({ id: 0, home: 0, owner: 0, ships: 24, growth: 4 });
    expect(typeof state.planets[0].name).toBe("string");
    expect(state.routes).toEqual(match.map.routes);
    expect(state.fleets).toEqual([expect.objectContaining({ owner: 0, from: 0, to: sent.to, ships: 10, progress: 0 })]);
    expect(state.match.status).toBe("running");
  });
});

describe("Warten", () => {
  it("kehrt zurück, sobald die nächste Runde da ist", async () => {
    const { match } = twoExternal();
    let done: boolean | null = null;
    void arena.wait(match, () => match.state.round > 0, 25_000).then((value) => (done = value));
    await vi.advanceTimersByTimeAsync(10);
    expect(done).toBeNull();
    arena.submitOrders(match, 0, 1, []);
    arena.submitOrders(match, 1, 1, []);
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toBe(true);
    expect(match.waiters.size).toBe(0);
  });

  it("gibt nach der Wartezeit auf", async () => {
    const match = arena.createMatch({});
    let done: boolean | null = null;
    void arena.wait(match, () => match.status !== "waiting", 2000).then((value) => (done = value));
    await vi.advanceTimersByTimeAsync(1999);
    expect(done).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(false);
    expect(match.waiters.size).toBe(0);
  });

  it("antwortet sofort, wenn die Bedingung schon gilt oder nicht gewartet werden soll", async () => {
    const match = arena.createMatch({});
    await expect(arena.wait(match, () => true, 5000)).resolves.toBe(true);
    await expect(arena.wait(match, () => false, 0)).resolves.toBe(false);
  });

  it("weckt Wartende auch bei Beitritt, Start und Abbruch", async () => {
    const match = arena.createMatch({});
    const seen: number[] = [];
    const watch = (since: number) => arena.wait(match, () => match.version > since, 25_000).then(() => seen.push(match.version));
    void watch(match.version);
    arena.join(match.id, "Alpha");
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toHaveLength(1);
    void watch(match.version);
    arena.abort(match.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toHaveLength(2);
    expect(match.status).toBe("aborted");
    expect(match.result).toEqual({ winner: null, reason: "aborted" });
  });
});

describe("Verwaltung", () => {
  it("listet Matches, neueste zuerst", () => {
    const first = arena.createMatch({ label: "eins" });
    vi.advanceTimersByTime(10);
    const second = arena.createMatch({ label: "zwei" });
    expect(arena.listMatches().map((match) => match.id)).toEqual([second.id, first.id]);
    expect(arena.listMatches(1)).toHaveLength(1);
    expect(arena.listMatches()[0].label).toBe("zwei");
  });

  it("begrenzt die Zahl gleichzeitig laufender Matches", () => {
    for (let i = 0; i < ARENA_LIMITS.maxRunningMatches; i++) arena.createMatch({ demo: true });
    expect(code(() => arena.createMatch({ demo: true }))).toBe("arena_busy");
    expect(arena.runningCount()).toBe(ARENA_LIMITS.maxRunningMatches);
  });

  it("bricht ein Wartezimmer ab, dem lange niemand beitritt", () => {
    const match = arena.createMatch({});
    vi.advanceTimersByTime(ARENA_LIMITS.waitingTtlMs + 1);
    arena.listMatches();
    expect(match.status).toBe("aborted");
  });

  it("kann ein Match nur einmal abbrechen", () => {
    const match = arena.createMatch({ demo: true });
    arena.abort(match.id);
    expect(code(() => arena.abort(match.id))).toBe("already_over");
    vi.advanceTimersByTime(10_000);
    expect(match.state.round).toBe(0);
  });

  it("meldet das Ende eines Matches an Zuhörer", () => {
    const ended: string[] = [];
    arena.onMatchEnd((match) => ended.push(`${match.id}:${match.status}`));
    const match = arena.createMatch({ demo: true, options: { seed: 2026, roundMs: 100 } });
    vi.advanceTimersByTime(120 * 100);
    expect(ended).toEqual([`${match.id}:finished`]);
  });

  it("meldet Lebenszeichen mit Start-Kennung und eingebauten Bots", () => {
    const health = arena.health();
    expect(health.ok).toBe(true);
    expect(health.bootId).toHaveLength(12);
    expect(health.bots.map((bot) => bot.id)).toEqual(["standard", "sturm", "passiv"]);
    expect(health.rules).toBe(RULES);
    expect(health.params.home.guard).toBe(15);
    expect(health.presets).toEqual({ turnier: { roundMs: 8000, timeoutMs: 5000 }, test: { roundMs: 100, timeoutMs: 2000 } });
    expect(health.limits.planets).toEqual([15, 17]);
    expect(health.limits.maxWaitSeconds).toBe(25);
    expect(new Arena().bootId).not.toBe(health.bootId);
  });
});
