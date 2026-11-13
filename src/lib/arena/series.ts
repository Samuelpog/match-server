import type { BuiltinBot, Seat } from "@/lib/game";
import { getBuiltinBot } from "@/lib/game";
import type {
  CreateSeriesRequest,
  MatchOptions,
  PlayerSpec,
  SeriesGame,
  SeriesInfo,
  SeriesPlayer,
  SeriesPlayerState,
  SeriesStatus,
} from "./api-types-v2";
import {
  ARENA_LIMITS,
  type Arena,
  type MatchRuntime,
  getArena,
  hashToken,
  newId,
  newToken,
  normalizeOptions,
  normalizePlayers,
  sameHash,
} from "./arena";
import { ArenaError, errors } from "./errors";

export const SERIES_LIMITS = {
  /** Pause zwischen zwei Spielen einer Serie, damit Zuschauer das Ergebnis sehen. */
  pauseMs: 4000,
  /** Kann das nächste Spiel nicht starten, weil die Arena voll ist, wird so oft neu versucht. */
  retryMs: 3000,
  maxFinishedSeries: 50,
  maxOpenSeries: 20,
} as const;

type Slot = 0 | 1;

interface SlotRuntime {
  spec: PlayerSpec;
  bot: BuiltinBot | null;
  name: string | null;
  tokenHash: string | null;
  joined: boolean;
  lastSeenAt: number | null;
}

interface GameRecord extends SeriesGame {
  /** Ist das Ergebnis schon in die Wertung eingegangen? */
  counted: boolean;
}

export interface SeriesRuntime {
  id: string;
  status: SeriesStatus;
  version: number;
  bestOf: 1 | 3 | 5;
  slots: [SlotRuntime, SlotRuntime];
  options: MatchOptions;
  label: string | null;
  games: GameRecord[];
  wins: [number, number];
  draws: number;
  winner: Slot | null;
  createdAt: number;
  finishedAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  waiters: Set<() => void>;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, ARENA_LIMITS.maxNameLength);
  return cleaned || null;
}

/**
 * Führt Serien (Best-of-1, 3 oder 5) zwischen denselben zwei Teilnehmern.
 * Legt die Matches der Reihe nach in der Arena an, wechselt die Sitze und
 * zählt die Siege. Ein Bot tritt einmal bei, sein Token gilt in jedem Match.
 */
export class SeriesManager {
  private all = new Map<string, SeriesRuntime>();
  private unsubscribe: () => void;

  constructor(private arena: Arena) {
    this.unsubscribe = arena.onMatchEnd((match) => this.onMatchEnd(match));
  }

  // ---------------------------------------------------------------- Anlegen

  create(request: CreateSeriesRequest): SeriesRuntime {
    this.sweep();
    const open = [...this.all.values()].filter((entry) => entry.status === "waiting" || entry.status === "running");
    if (open.length >= SERIES_LIMITS.maxOpenSeries) throw errors.busy(SERIES_LIMITS.maxOpenSeries);

    const bestOf = request.bestOf ?? 3;
    if (bestOf !== 1 && bestOf !== 3 && bestOf !== 5) throw errors.badRequest('"bestOf" muss 1, 3 oder 5 sein.');
    const players = normalizePlayers(request.players, request.demo);
    const slot = (spec: PlayerSpec): SlotRuntime => {
      const bot = spec.type === "bot" ? getBuiltinBot(spec.bot) : null;
      return {
        spec,
        bot,
        name: bot ? bot.name : spec.type === "open" ? (spec.name ?? null) : null,
        tokenHash: null,
        joined: bot !== null,
        lastSeenAt: null,
      };
    };

    let id = newId();
    while (this.all.has(id)) id = newId();
    const series: SeriesRuntime = {
      id,
      status: "waiting",
      version: 1,
      bestOf,
      slots: [slot(players[0]), slot(players[1])],
      options: normalizeOptions(request.options),
      label: cleanName(request.label),
      games: [],
      wins: [0, 0],
      draws: 0,
      winner: null,
      createdAt: Date.now(),
      finishedAt: null,
      timer: null,
      waiters: new Set(),
    };
    this.all.set(id, series);
    if (series.slots.every((entry) => entry.joined)) this.startNextGame(series);
    return series;
  }

  // ----------------------------------------------------------------- Lesen

  get(id: string): SeriesRuntime {
    const series = this.all.get(id);
    if (!series) throw errors.seriesNotFound();
    return series;
  }

  list(limit = 50): SeriesInfo[] {
    this.sweep();
    return [...this.all.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((series) => this.info(series));
  }

  /** Das laufende Match der Serie, sonst `null`. */
  private currentMatch(series: SeriesRuntime): MatchRuntime | null {
    const last = series.games.at(-1);
    if (!last || last.counted) return null;
    const match = this.arena.findMatch(last.matchId);
    return match && (match.status === "running" || match.status === "waiting") ? match : null;
  }

  info(series: SeriesRuntime): SeriesInfo {
    const now = Date.now();
    const current = this.currentMatch(series);
    const player = (slot: Slot): SeriesPlayer => {
      const entry = series.slots[slot];
      let seen = entry.lastSeenAt;
      if (current) {
        const seat = series.games.at(-1)!.seats.indexOf(slot);
        const inMatch = current.seats[seat].lastSeenAt;
        if (inMatch !== null && (seen === null || inMatch > seen)) seen = inMatch;
      }
      return {
        slot,
        name: entry.name,
        kind: entry.bot ? "bot" : "external",
        bot: entry.bot?.id ?? null,
        joined: entry.joined,
        online: entry.bot !== null || (seen !== null && now - seen < ARENA_LIMITS.onlineWindowMs),
      };
    };
    return {
      id: series.id,
      status: series.status,
      version: series.version,
      bestOf: series.bestOf,
      players: [player(0), player(1)],
      wins: [series.wins[0], series.wins[1]],
      draws: series.draws,
      games: series.games.map(({ game, matchId, seats, status, winner, result }) => {
        const live = this.arena.findMatch(matchId);
        return { game, matchId, seats, status: live?.status ?? status, winner, result: live?.result ?? result };
      }),
      current: current?.id ?? null,
      winner: series.winner,
      options: series.options,
      label: series.label,
      createdAt: series.createdAt,
    };
  }

  // ------------------------------------------------------------------ Bots

  join(id: string, name: unknown): { slot: Slot; token: string } {
    const series = this.get(id);
    if (series.status !== "waiting") throw errors.full();
    const slot = series.slots.findIndex((entry) => !entry.joined) as Slot | -1;
    if (slot === -1) throw errors.full();
    const entry = series.slots[slot];
    const token = newToken();
    entry.tokenHash = hashToken(token);
    entry.joined = true;
    entry.name = cleanName(name) ?? entry.name ?? `Teilnehmer ${slot + 1}`;
    entry.lastSeenAt = Date.now();
    this.touch(series);
    if (series.slots.every((other) => other.joined)) this.startNextGame(series);
    return { slot, token };
  }

  authenticate(id: string, token: string | null): { series: SeriesRuntime; slot: Slot } {
    const series = this.get(id);
    if (!token) throw errors.unauthorized();
    const given = hashToken(token);
    const slot = series.slots.findIndex((entry) => entry.tokenHash !== null && sameHash(entry.tokenHash, given));
    if (slot === -1) throw errors.unauthorized();
    series.slots[slot].lastSeenAt = Date.now();
    return { series, slot: slot as Slot };
  }

  /** In welchem Match und auf welchem Sitz der Teilnehmer jetzt spielen soll. */
  assignment(series: SeriesRuntime, slot: Slot): { matchId: string; seat: Seat } | null {
    const current = this.currentMatch(series);
    if (!current) return null;
    return { matchId: current.id, seat: series.games.at(-1)!.seats.indexOf(slot) as Seat };
  }

  playerState(series: SeriesRuntime, slot: Slot): SeriesPlayerState {
    return { series: this.info(series), you: slot, current: this.assignment(series, slot) };
  }

  abort(id: string): SeriesRuntime {
    const series = this.get(id);
    if (series.status === "finished" || series.status === "aborted") throw errors.alreadyOver(series.status);
    this.finish(series, "aborted");
    const current = this.currentMatch(series);
    if (current) this.arena.abort(current.id);
    return series;
  }

  // ----------------------------------------------------------------- Warten

  wait(series: SeriesRuntime, ready: () => boolean, waitMs: number): Promise<boolean> {
    if (ready()) return Promise.resolve(true);
    if (waitMs <= 0) return Promise.resolve(false);
    return new Promise((resolve) => {
      const finish = (value: boolean) => {
        clearTimeout(timer);
        series.waiters.delete(check);
        resolve(value);
      };
      const check = () => {
        if (ready()) finish(true);
      };
      const timer = setTimeout(() => finish(ready()), waitMs);
      series.waiters.add(check);
    });
  }

  private touch(series: SeriesRuntime) {
    series.version += 1;
    for (const waiter of [...series.waiters]) waiter();
  }

  // ---------------------------------------------------------------- Ablauf

  private startNextGame(series: SeriesRuntime) {
    series.timer = null;
    if (series.status === "finished" || series.status === "aborted") return;
    const game = series.games.length + 1;
    // Die Sitze wechseln von Spiel zu Spiel, jedes Spiel bekommt eine eigene Karte.
    const seats: [Slot, Slot] = game % 2 === 1 ? [0, 1] : [1, 0];
    const preset = (slot: Slot) => {
      const entry = series.slots[slot];
      return { spec: entry.spec, name: entry.name, tokenHash: entry.tokenHash, joined: true };
    };
    let match: MatchRuntime;
    try {
      match = this.arena.createMatchInternal({
        seats: [preset(seats[0]), preset(seats[1])],
        options: { ...series.options, seed: (series.options.seed + game - 1) >>> 0 },
        label: `${series.label ?? "Serie"} · Spiel ${game}`,
        series: { id: series.id, game },
      });
    } catch (error) {
      if (!(error instanceof ArenaError) || error.code !== "arena_busy") throw error;
      series.timer = setTimeout(() => this.startNextGame(series), SERIES_LIMITS.retryMs);
      series.timer.unref?.();
      return;
    }
    series.status = "running";
    series.games.push({ game, matchId: match.id, seats, status: match.status, winner: null, result: null, counted: false });
    this.touch(series);
  }

  private onMatchEnd(match: MatchRuntime) {
    if (!match.series) return;
    const series = this.all.get(match.series.id);
    const record = series?.games.find((entry) => entry.matchId === match.id);
    if (!series || !record || record.counted) return;

    record.counted = true;
    record.status = match.status;
    record.result = match.result;
    if (match.status === "aborted") {
      // Ein abgebrochenes Spiel beendet die Serie, sonst liefe sie ohne Zuschauer weiter.
      if (series.status === "running") this.finish(series, "aborted");
      return;
    }
    const winnerSeat = match.result?.winner ?? null;
    record.winner = winnerSeat === null ? null : record.seats[winnerSeat];
    if (record.winner === null) series.draws += 1;
    else series.wins[record.winner] += 1;

    const [a, b] = series.wins;
    const decided = Math.max(a, b) > series.bestOf / 2 || series.games.length >= series.bestOf;
    if (decided) {
      series.winner = a === b ? null : a > b ? 0 : 1;
      this.finish(series, "finished");
      return;
    }
    this.touch(series);
    series.timer = setTimeout(() => this.startNextGame(series), SERIES_LIMITS.pauseMs);
    series.timer.unref?.();
  }

  private finish(series: SeriesRuntime, status: "finished" | "aborted") {
    if (series.timer) clearTimeout(series.timer);
    series.timer = null;
    series.status = status;
    series.finishedAt = Date.now();
    this.touch(series);
  }

  private sweep() {
    const now = Date.now();
    for (const series of this.all.values()) {
      if (series.status === "waiting" && now - series.createdAt > ARENA_LIMITS.waitingTtlMs) this.finish(series, "aborted");
    }
    const done = [...this.all.values()]
      .filter((series) => series.status === "finished" || series.status === "aborted")
      .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
    for (const series of done.slice(0, Math.max(0, done.length - SERIES_LIMITS.maxFinishedSeries))) {
      this.all.delete(series.id);
    }
  }

  /** Hält alle Timer an und löst sich von der Arena. Für Tests. */
  shutdown() {
    this.unsubscribe();
    for (const series of this.all.values()) {
      if (series.timer) clearTimeout(series.timer);
      series.timer = null;
    }
  }
}

const GLOBAL_KEY = Symbol.for("planetwars.series");

/** Die eine Serien-Verwaltung dieses Prozesses, an derselben Arena wie `getArena()`. */
export function getSeries(): SeriesManager {
  const holder = globalThis as unknown as Record<symbol, SeriesManager | undefined>;
  return (holder[GLOBAL_KEY] ??= new SeriesManager(getArena()));
}
