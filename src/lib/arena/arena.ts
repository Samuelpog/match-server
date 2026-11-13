import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import {
  BUILTIN_BOTS,
  DEFAULTS,
  DEMO_BOTS,
  LIMITS,
  PARAMS,
  RULES,
  actionLimit,
  checkActions,
  frameOf,
  generateMap,
  getBuiltinBot,
  initialFrame,
  initialState,
  outcome,
  resolveRound,
  runBot,
  viewFor,
  type ActionRecord,
  type BuiltinBot,
  type Frame,
  type GameMap,
  type GameResult,
  type GameState,
  type Seat,
} from "@/lib/game";
import type {
  CreateMatchRequest,
  HealthResponse,
  MatchInfo,
  MatchOptions,
  MatchStatus,
  PlayerInfo,
  PlayerSpec,
  PlayerState,
  ReplayResponse,
} from "./api-types-v2";
import { errors } from "./errors";
import { PRESETS } from "./replay-file-v2";

export const ARENA_LIMITS = {
  roundMs: [100, 10_000],
  timeoutMs: [500, 30_000],
  /** Längste Wartezeit für `?wait=`, in Sekunden. */
  maxWaitSeconds: 25,
  maxRunningMatches: 8,
  /** So viele beendete Matches bleiben im Speicher, ältere werden verworfen. */
  maxFinishedMatches: 200,
  /** So viele Matches dürfen gleichzeitig auf Bots warten. */
  maxWaitingMatches: 40,
  /** Ein Match, dem so lange niemand beitritt, wird abgebrochen. */
  waitingTtlMs: 30 * 60_000,
  /** Die erste Runde hat mindestens diese Frist, damit Bots in Ruhe starten können. */
  firstRoundGraceMs: 5000,
  /** Nach so vielen verpassten Fristen in Folge wird auf einen Bot nicht mehr gewartet. */
  absentAfterMissed: 5,
  onlineWindowMs: 30_000,
  maxNameLength: 40,
  maxLabelLength: 80,
} as const;

/** Ohne leicht verwechselbare Zeichen (0/o, 1/l/i), damit man die ID abtippen kann. */
const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function newId(length = 10): string {
  return Array.from({ length }, () => ID_ALPHABET[randomInt(ID_ALPHABET.length)]).join("");
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
  return cleaned || null;
}

function intOption(name: string, value: unknown, fallback: number, [min, max]: readonly [number, number]): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw errors.badRequest(`"${name}" muss eine ganze Zahl von ${min} bis ${max} sein.`);
  }
  return value;
}

/** Füllt fehlende Einstellungen mit Standardwerten und prüft die Wertebereiche. */
export function normalizeOptions(input: unknown): MatchOptions {
  if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input))) {
    throw errors.badRequest('"options" muss ein Objekt sein.');
  }
  const raw = (input ?? {}) as Record<string, unknown>;
  const options: MatchOptions = {
    seed: intOption("seed", raw.seed, randomInt(0x1_0000_0000), [0, 0xffffffff]),
    planets: intOption("planets", raw.planets, DEFAULTS.planets, [0, 99]),
    rounds: intOption("rounds", raw.rounds, DEFAULTS.rounds, [LIMITS.minRounds, LIMITS.maxRounds]),
    roundMs: intOption("roundMs", raw.roundMs, PRESETS.turnier.roundMs, ARENA_LIMITS.roundMs),
    timeoutMs: intOption("timeoutMs", raw.timeoutMs, PRESETS.turnier.timeoutMs, ARENA_LIMITS.timeoutMs),
  };
  if (!(LIMITS.planetCounts as readonly number[]).includes(options.planets)) {
    throw errors.badRequest(`"planets" muss ${LIMITS.planetCounts.join(" oder ")} sein.`);
  }
  for (const old of ["tickLimit", "tickMs"]) {
    if (raw[old] !== undefined) throw errors.badRequest(`"${old}" gibt es nicht mehr. Die Optionen heißen jetzt "rounds" und "roundMs".`);
  }
  return options;
}

/** Prüft die Angabe, wer auf den beiden Sitzen spielt. */
export function normalizePlayers(players: unknown, demo: unknown): [PlayerSpec, PlayerSpec] {
  if (players === undefined || players === null) {
    return demo === true
      ? [
          { type: "bot", bot: DEMO_BOTS[0] },
          { type: "bot", bot: DEMO_BOTS[1] },
        ]
      : [{ type: "open" }, { type: "open" }];
  }
  if (!Array.isArray(players) || players.length !== 2) {
    throw errors.badRequest('"players" muss eine Liste mit genau zwei Einträgen sein.');
  }
  return players.map((raw: unknown): PlayerSpec => {
    if (raw === null || typeof raw !== "object") throw errors.badRequest('Ein Eintrag in "players" muss ein Objekt sein.');
    const spec = raw as Record<string, unknown>;
    if (spec.type === "bot") {
      if (typeof spec.bot !== "string" || !getBuiltinBot(spec.bot)) throw errors.unknownBot(String(spec.bot));
      return { type: "bot", bot: spec.bot };
    }
    if (spec.type === "open") {
      const name = cleanText(spec.name, ARENA_LIMITS.maxNameLength);
      return name ? { type: "open", name } : { type: "open" };
    }
    throw errors.badRequest('"type" eines Spielers muss "bot" oder "open" sein.');
  }) as [PlayerSpec, PlayerSpec];
}

interface SeatRuntime {
  kind: "bot" | "external";
  bot: BuiltinBot | null;
  name: string | null;
  tokenHash: string | null;
  joined: boolean;
  lastSeenAt: number | null;
  /** Verpasste Fristen in Folge. */
  missed: number;
  absent: boolean;
  /** Für die laufende Runde eingereichte Aktionen, `null` solange nichts kam. */
  pending: unknown[] | null;
}

export interface MatchRuntime {
  id: string;
  status: MatchStatus;
  version: number;
  options: MatchOptions;
  map: GameMap;
  state: GameState;
  frames: Frame[];
  seats: [SeatRuntime, SeatRuntime];
  result: GameResult | null;
  series: { id: string; game: number } | null;
  label: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** Beginn der laufenden Runde. */
  roundStartedAt: number;
  /** Frist der laufenden Runde. Danach wird für sie nichts mehr angenommen. */
  deadlineAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  waiters: Set<() => void>;
}

/** Vorbesetzter Sitz, wenn eine Serie ein Match anlegt. */
export interface SeatPreset {
  spec: PlayerSpec;
  name?: string | null;
  tokenHash?: string | null;
  joined?: boolean;
}

export interface CreateMatchInternal {
  seats: [SeatPreset, SeatPreset];
  options: MatchOptions;
  label: string | null;
  series?: { id: string; game: number } | null;
}

type MatchListener = (match: MatchRuntime) => void;

/**
 * Hält alle Matches im Arbeitsspeicher und treibt ihren Takt. Es gibt genau
 * eine Arena je Prozess, siehe `getArena()`.
 */
export class Arena {
  readonly bootId = newId(12);
  readonly startedAt = Date.now();
  private matches = new Map<string, MatchRuntime>();
  private finishListeners = new Set<MatchListener>();

  // ---------------------------------------------------------------- Anlegen

  createMatch(request: CreateMatchRequest): MatchRuntime {
    const players = normalizePlayers(request.players, request.demo);
    return this.createMatchInternal({
      seats: [{ spec: players[0] }, { spec: players[1] }],
      options: normalizeOptions(request.options),
      label: cleanText(request.label, ARENA_LIMITS.maxLabelLength),
    });
  }

  createMatchInternal(input: CreateMatchInternal): MatchRuntime {
    this.sweep();
    const all = [...this.matches.values()];
    if (all.filter((match) => match.status === "running").length >= ARENA_LIMITS.maxRunningMatches) {
      throw errors.busy(ARENA_LIMITS.maxRunningMatches);
    }
    if (all.filter((match) => match.status === "waiting").length >= ARENA_LIMITS.maxWaitingMatches) {
      throw errors.busy(ARENA_LIMITS.maxWaitingMatches);
    }

    const { options } = input;
    const map = generateMap({ seed: options.seed, planets: options.planets });
    const state = initialState(map);
    const now = Date.now();
    const seat = (preset: SeatPreset): SeatRuntime => {
      const bot = preset.spec.type === "bot" ? getBuiltinBot(preset.spec.bot) : null;
      if (preset.spec.type === "bot" && !bot) throw errors.unknownBot(preset.spec.bot);
      return {
        kind: bot ? "bot" : "external",
        bot,
        name: bot ? bot.name : (preset.name ?? (preset.spec.type === "open" ? (preset.spec.name ?? null) : null)),
        tokenHash: preset.tokenHash ?? null,
        joined: bot ? true : (preset.joined ?? false),
        lastSeenAt: null,
        missed: 0,
        absent: false,
        pending: null,
      };
    };

    let id = newId();
    while (this.matches.has(id)) id = newId();
    const match: MatchRuntime = {
      id,
      status: "waiting",
      version: 1,
      options,
      map,
      state,
      frames: [initialFrame(map, state, [actionLimit(state, 0), actionLimit(state, 1)])],
      seats: [seat(input.seats[0]), seat(input.seats[1])],
      result: null,
      series: input.series ?? null,
      label: input.label,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      roundStartedAt: now,
      deadlineAt: now,
      timer: null,
      waiters: new Set(),
    };
    this.matches.set(id, match);
    if (match.seats.every((entry) => entry.joined)) this.start(match);
    return match;
  }

  // ----------------------------------------------------------------- Lesen

  getMatch(id: string): MatchRuntime {
    const match = this.matches.get(id);
    if (!match) throw errors.matchNotFound();
    return match;
  }

  findMatch(id: string): MatchRuntime | null {
    return this.matches.get(id) ?? null;
  }

  listMatches(limit = 50): MatchInfo[] {
    this.sweep();
    return [...this.matches.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((match) => this.info(match));
  }

  runningCount(): number {
    let count = 0;
    for (const match of this.matches.values()) if (match.status === "running") count++;
    return count;
  }

  info(match: MatchRuntime): MatchInfo {
    const now = Date.now();
    const player = (seat: Seat): PlayerInfo => {
      const entry = match.seats[seat];
      return {
        seat,
        name: entry.name,
        kind: entry.kind,
        bot: entry.bot?.id ?? null,
        joined: entry.joined,
        online:
          entry.kind === "bot" || (entry.lastSeenAt !== null && now - entry.lastSeenAt < ARENA_LIMITS.onlineWindowMs),
        absent: entry.absent,
      };
    };
    return {
      id: match.id,
      status: match.status,
      version: match.version,
      rules: RULES,
      params: PARAMS,
      round: match.state.round,
      rounds: match.options.rounds,
      roundMs: match.options.roundMs,
      timeoutMs: match.options.timeoutMs,
      seed: match.options.seed,
      players: [player(0), player(1)],
      result: match.result,
      series: match.series,
      label: match.label,
      createdAt: match.createdAt,
      startedAt: match.startedAt,
      finishedAt: match.finishedAt,
    };
  }

  replay(match: MatchRuntime, from: number): ReplayResponse {
    const frames = match.frames.slice(Math.max(0, from));
    return {
      format: "planetwars-replay",
      version: 2,
      match: this.info(match),
      map: match.map,
      frames,
      next: match.frames.length,
    };
  }

  playerState(match: MatchRuntime, seat: Seat): PlayerState {
    const running = match.status === "running";
    return {
      ...viewFor(match.map, match.state, seat, match.options.rounds),
      match: this.info(match),
      deadlineMs: running ? Math.max(0, match.deadlineAt - Date.now()) : null,
      submitted: running && match.seats[seat].pending !== null,
    };
  }

  // ----------------------------------------------------------------- Bots

  join(id: string, name: unknown): { seat: Seat; token: string } {
    const match = this.getMatch(id);
    if (match.status !== "waiting") throw errors.full();
    const seat = match.seats.findIndex((entry) => entry.kind === "external" && !entry.joined) as Seat | -1;
    if (seat === -1) throw errors.full();
    const entry = match.seats[seat];
    const token = newToken();
    entry.tokenHash = hashToken(token);
    entry.joined = true;
    entry.name = cleanText(name, ARENA_LIMITS.maxNameLength) ?? entry.name ?? `Spieler ${seat + 1}`;
    entry.lastSeenAt = Date.now();
    this.touch(match);
    if (match.seats.every((other) => other.joined)) this.start(match);
    return { seat, token };
  }

  /** Prüft das Token und vermerkt, dass sich der Bot gemeldet hat. */
  authenticate(id: string, token: string | null): { match: MatchRuntime; seat: Seat } {
    const match = this.getMatch(id);
    if (!token) throw errors.unauthorized();
    const given = hashToken(token);
    const seat = match.seats.findIndex((entry) => entry.tokenHash !== null && sameHash(entry.tokenHash, given));
    if (seat === -1) throw errors.unauthorized();
    this.seen(match, seat as Seat);
    return { match, seat: seat as Seat };
  }

  private seen(match: MatchRuntime, seat: Seat) {
    const entry = match.seats[seat];
    const now = Date.now();
    const wasOnline = entry.lastSeenAt !== null && now - entry.lastSeenAt < ARENA_LIMITS.onlineWindowMs;
    entry.lastSeenAt = now;
    if (!wasOnline) this.touch(match);
  }

  submitOrders(
    match: MatchRuntime,
    seat: Seat,
    round: unknown,
    actions: unknown,
  ): { round: number; accepted: number; results: ActionRecord[] } {
    if (match.status !== "running") throw errors.notRunning(match.status);
    if (typeof round !== "number" || !Number.isInteger(round)) {
      throw errors.badRequest('"round" muss eine ganze Zahl sein. Der Body hat die Form {"round": Zahl, "actions": [...]}.');
    }
    if (!Array.isArray(actions)) throw errors.badRequest('"actions" muss eine Liste sein, notfalls eine leere.');
    const current = match.state.round + 1;
    if (round !== current) throw errors.staleRound(round, current);
    const entry = match.seats[seat];
    if (entry.pending !== null) throw errors.alreadySubmitted(round);
    if (Date.now() > match.deadlineAt) throw errors.tooLate(round);

    const results = checkActions(match.map, match.state, seat, actions);
    entry.pending = actions;
    entry.missed = 0;
    if (entry.absent) {
      entry.absent = false;
      this.touch(match);
    }
    this.schedule(match);
    return { round, accepted: results.filter((record) => record.ok).length, results };
  }

  abort(id: string): MatchRuntime {
    const match = this.getMatch(id);
    if (match.status === "finished" || match.status === "aborted") throw errors.alreadyOver(match.status);
    this.end(match, "aborted", { winner: null, reason: "aborted" });
    return match;
  }

  // ----------------------------------------------------------------- Warten

  /**
   * Wartet, bis `ready` zutrifft, höchstens `waitMs`. Geprüft wird nur, wenn
   * sich am Match etwas ändert, nicht im Takt. Gibt zurück, ob es zutraf.
   */
  wait(match: MatchRuntime, ready: () => boolean, waitMs: number): Promise<boolean> {
    if (ready()) return Promise.resolve(true);
    if (waitMs <= 0) return Promise.resolve(false);
    return new Promise((resolve) => {
      const finish = (value: boolean) => {
        clearTimeout(timer);
        match.waiters.delete(check);
        resolve(value);
      };
      const check = () => {
        if (ready()) finish(true);
      };
      const timer = setTimeout(() => finish(ready()), waitMs);
      match.waiters.add(check);
    });
  }

  /** Meldet, sobald ein Match endet oder abgebrochen wird. Für Serien. */
  onMatchEnd(listener: MatchListener): () => void {
    this.finishListeners.add(listener);
    return () => this.finishListeners.delete(listener);
  }

  // ------------------------------------------------------------------ Takt

  private touch(match: MatchRuntime) {
    match.version += 1;
    for (const waiter of [...match.waiters]) waiter();
  }

  private start(match: MatchRuntime) {
    match.status = "running";
    match.startedAt = Date.now();
    this.publishRound(match);
    this.touch(match);
  }

  /** Sitze, auf deren Aktionen in der laufenden Runde gewartet wird. */
  private awaited(match: MatchRuntime): SeatRuntime[] {
    return match.seats.filter((entry) => entry.kind === "external" && !entry.absent);
  }

  private publishRound(match: MatchRuntime) {
    const now = Date.now();
    const { roundMs, timeoutMs } = match.options;
    match.roundStartedAt = now;
    const timeout = match.state.round === 0 ? Math.max(timeoutMs, ARENA_LIMITS.firstRoundGraceMs) : timeoutMs;
    match.deadlineAt = now + (this.awaited(match).length > 0 ? timeout : roundMs);
    for (const entry of match.seats) entry.pending = null;
    this.schedule(match);
  }

  /**
   * Stellt den Timer auf den Moment, in dem die laufende Runde aufgelöst wird:
   * sobald alle eingereicht haben oder die Frist vorbei ist, frühestens aber
   * nach `roundMs`.
   */
  private schedule(match: MatchRuntime) {
    if (match.timer) clearTimeout(match.timer);
    match.timer = null;
    if (match.status !== "running") return;
    const earliest = match.roundStartedAt + match.options.roundMs;
    const everyoneIn = this.awaited(match).every((entry) => entry.pending !== null);
    const due = everyoneIn ? earliest : Math.max(earliest, match.deadlineAt);
    const delay = Math.max(0, due - Date.now());
    match.timer = setTimeout(() => this.resolve(match), delay);
    match.timer.unref?.();
  }

  private resolve(match: MatchRuntime) {
    match.timer = null;
    if (match.status !== "running") return;
    const { map, state, options } = match;
    const submitted: [boolean, boolean] = [true, true];
    const actions = match.seats.map((entry, index) => {
      if (entry.bot) return runBot(entry.bot.play, viewFor(map, state, index as Seat, options.rounds));
      if (entry.pending !== null) return entry.pending;
      submitted[index] = false;
      entry.missed += 1;
      if (entry.missed >= ARENA_LIMITS.absentAfterMissed) entry.absent = true;
      return [];
    }) as [unknown, unknown];

    const step = resolveRound(map, state, actions);
    match.state = step.state;
    match.frames.push(frameOf(map, step, submitted, Date.now() - (match.startedAt ?? Date.now())));

    const result = outcome(map, match.state, options.rounds);
    if (result) {
      this.end(match, "finished", result);
      return;
    }
    this.publishRound(match);
    this.touch(match);
  }

  private end(match: MatchRuntime, status: "finished" | "aborted", result: GameResult) {
    if (match.timer) clearTimeout(match.timer);
    match.timer = null;
    match.status = status;
    match.result = result;
    match.finishedAt = Date.now();
    for (const entry of match.seats) entry.pending = null;
    this.touch(match);
    for (const listener of [...this.finishListeners]) listener(match);
    this.sweep();
  }

  /** Bricht verwaiste Wartezimmer ab und verwirft die ältesten beendeten Matches. */
  private sweep() {
    const now = Date.now();
    for (const match of this.matches.values()) {
      if (match.status === "waiting" && !match.series && now - match.createdAt > ARENA_LIMITS.waitingTtlMs) {
        this.end(match, "aborted", { winner: null, reason: "aborted" });
      }
    }
    const done = [...this.matches.values()]
      .filter((match) => match.status === "finished" || match.status === "aborted")
      .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
    for (const match of done.slice(0, Math.max(0, done.length - ARENA_LIMITS.maxFinishedMatches))) {
      this.matches.delete(match.id);
    }
  }

  /** Hält alle Timer an. Für Tests. */
  shutdown() {
    for (const match of this.matches.values()) {
      if (match.timer) clearTimeout(match.timer);
      match.timer = null;
    }
  }

  health(): HealthResponse {
    return {
      ok: true,
      commit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? null,
      bootId: this.bootId,
      startedAt: this.startedAt,
      arenaKeyRequired: Boolean(process.env.ARENA_KEY),
      bots: BUILTIN_BOTS.map(({ id, name, description }) => ({ id, name, description })),
      rules: RULES,
      params: PARAMS,
      defaults: {
        seed: 0,
        planets: DEFAULTS.planets,
        rounds: DEFAULTS.rounds,
        roundMs: PRESETS.turnier.roundMs,
        timeoutMs: PRESETS.turnier.timeoutMs,
      },
      presets: { turnier: { ...PRESETS.turnier }, test: { ...PRESETS.test } },
      limits: {
        planets: [...LIMITS.planetCounts],
        rounds: [LIMITS.minRounds, LIMITS.maxRounds],
        roundMs: [ARENA_LIMITS.roundMs[0], ARENA_LIMITS.roundMs[1]],
        timeoutMs: [ARENA_LIMITS.timeoutMs[0], ARENA_LIMITS.timeoutMs[1]],
        maxWaitSeconds: ARENA_LIMITS.maxWaitSeconds,
        maxRunningMatches: ARENA_LIMITS.maxRunningMatches,
      },
      running: this.runningCount(),
    };
  }
}

const GLOBAL_KEY = Symbol.for("planetwars.arena");

/**
 * Die eine Arena dieses Prozesses. Sie hängt an `globalThis`, damit alle
 * Route-Handler denselben Stand sehen, auch wenn der Bundler dieses Modul
 * mehrfach lädt.
 */
export function getArena(): Arena {
  const holder = globalThis as unknown as Record<symbol, Arena | undefined>;
  return (holder[GLOBAL_KEY] ??= new Arena());
}
