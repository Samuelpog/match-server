import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { DEFAULT_GAME, getGame } from "@/lib/games";
import { errors } from "./errors";
import type { MatchStore } from "./store";
import {
  InvalidMoveError,
  type GameModule,
  type MatchRecord,
  type MatchView,
  type PlayerMatchView,
  type Seat,
} from "./types";

/** Ein Spieler gilt als online, wenn er sich in dieser Zeit gemeldet hat. */
const ONLINE_WINDOW_MS = 60_000;
const LOG_LENGTH = 50;
const MAX_NAME_LENGTH = 40;
const MAX_WRITE_ATTEMPTS = 5;
/** Ohne leicht verwechselbare Zeichen (0/o, 1/l/i), damit man die ID abtippen kann. */
const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function newId() {
  return Array.from({ length: 10 }, () => ID_ALPHABET[randomInt(ID_ALPHABET.length)]).join("");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function gameOf(record: MatchRecord): GameModule {
  const game = getGame(record.game);
  if (!game) throw errors.unknownGame(record.game);
  return game;
}

function seatOf(record: MatchRecord, token: string | null): Seat {
  if (!token) throw errors.unauthorized();
  const given = Buffer.from(hashToken(token), "hex");
  const seat = record.seats.findIndex(
    (entry) => entry !== null && timingSafeEqual(Buffer.from(entry.tokenHash, "hex"), given),
  );
  if (seat === -1) throw errors.unauthorized();
  return seat;
}

async function load(store: MatchStore, id: string): Promise<MatchRecord> {
  const record = await store.get(id);
  if (!record) throw errors.notFound();
  return record;
}

/**
 * Lädt das Match, lässt `change` den neuen Stand berechnen und speichert ihn.
 * Kommt ein anderer Aufruf dazwischen, wird mit dem frischen Stand wiederholt.
 * Gibt `change` nichts zurück, bleibt das Match unverändert.
 */
async function mutate(
  store: MatchStore,
  id: string,
  change: (record: MatchRecord) => MatchRecord | null,
): Promise<MatchRecord> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const current = await load(store, id);
    const next = change(structuredClone(current));
    if (!next) return current;
    next.version = current.version + 1;
    next.updatedAt = Date.now();
    if (await store.update(next, current.version)) return next;
  }
  throw errors.conflict();
}

async function toView(store: MatchStore, record: MatchRecord): Promise<MatchView> {
  const game = gameOf(record);
  const seen = await store.presence(record.id, record.seats.length);
  const now = Date.now();
  const started = record.status !== "waiting";
  return {
    id: record.id,
    game: { id: game.id, name: game.name },
    status: record.status,
    version: record.version,
    turn: record.status === "running" ? game.turn(record.state) : null,
    seats: record.seats.map((entry, seat) => {
      const lastSeenAt = seen[seat] ?? null;
      return {
        seat,
        name: entry?.name ?? null,
        joined: entry !== null,
        online: lastSeenAt !== null && now - lastSeenAt < ONLINE_WINDOW_MS,
        lastSeenAt,
      };
    }),
    moveCount: record.moves.length,
    log: record.moves.slice(-LOG_LENGTH).map(({ n, seat, at, event }) => ({ n, seat, at, event })),
    result: record.result,
    view: started ? game.publicView(record.state) : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function toPlayerView(store: MatchStore, record: MatchRecord, seat: Seat): Promise<PlayerMatchView> {
  const view = await toView(store, record);
  const game = gameOf(record);
  return {
    ...view,
    view: record.status === "waiting" ? null : game.playerView(record.state, seat),
    you: { seat, yourTurn: record.status === "running" && (view.turn === null || view.turn === seat) },
  };
}

export async function createMatch(store: MatchStore, gameId: string = DEFAULT_GAME): Promise<MatchRecord> {
  const game = getGame(gameId);
  if (!game) throw errors.unknownGame(gameId);
  const now = Date.now();
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const record: MatchRecord = {
      id: newId(),
      game: game.id,
      status: "waiting",
      version: 1,
      createdAt: now,
      updatedAt: now,
      seats: Array.from({ length: game.seats }, () => null),
      state: null,
      moves: [],
      result: null,
    };
    if (await store.create(record)) return record;
  }
  throw errors.conflict();
}

export async function joinMatch(
  store: MatchStore,
  id: string,
  name: unknown,
): Promise<{ seat: Seat; token: string; match: PlayerMatchView }> {
  const token = randomBytes(24).toString("base64url");
  let seat: Seat = -1;
  const record = await mutate(store, id, (draft) => {
    seat = draft.seats.findIndex((entry) => entry === null);
    if (seat === -1) throw errors.full();
    const cleaned = typeof name === "string" ? name.trim().slice(0, MAX_NAME_LENGTH) : "";
    draft.seats[seat] = {
      name: cleaned || `Spieler ${seat + 1}`,
      tokenHash: hashToken(token),
      joinedAt: Date.now(),
    };
    if (draft.seats.every((entry) => entry !== null)) {
      draft.state = gameOf(draft).init();
      draft.status = "running";
    }
    return draft;
  });
  await store.touch(id, seat, Date.now());
  return { seat, token, match: await toPlayerView(store, record, seat) };
}

export async function getPublicView(store: MatchStore, id: string): Promise<MatchView> {
  return toView(store, await load(store, id));
}

/** Prüft das Token und vermerkt, dass sich der Spieler gemeldet hat. */
export async function authenticate(store: MatchStore, id: string, token: string | null): Promise<Seat> {
  const seat = seatOf(await load(store, id), token);
  await store.touch(id, seat, Date.now());
  return seat;
}

export async function getPlayerView(store: MatchStore, id: string, token: string | null): Promise<PlayerMatchView> {
  const record = await load(store, id);
  const seat = seatOf(record, token);
  await store.touch(id, seat, Date.now());
  return toPlayerView(store, record, seat);
}

export async function submitMove(
  store: MatchStore,
  id: string,
  token: string | null,
  move: unknown,
  moveId?: string,
): Promise<PlayerMatchView> {
  let seat: Seat = -1;
  const record = await mutate(store, id, (draft) => {
    seat = seatOf(draft, token);
    if (move === undefined) throw errors.badRequest('Im Body fehlt das Feld "move".');
    const own = draft.moves.filter((entry) => entry.seat === seat);
    if (moveId && own.at(-1)?.moveId === moveId) return null;
    if (draft.status !== "running") throw errors.notRunning(draft.status);
    const game = gameOf(draft);
    const turn = game.turn(draft.state);
    if (turn !== null && turn !== seat) throw errors.notYourTurn();

    let applied: ReturnType<GameModule["applyMove"]>;
    try {
      applied = game.applyMove(draft.state, seat, move);
    } catch (error) {
      if (error instanceof InvalidMoveError) throw errors.invalidMove(error.message);
      throw error;
    }

    draft.state = applied.state;
    draft.moves.push({ n: draft.moves.length + 1, seat, at: Date.now(), moveId, event: applied.event ?? null });
    const result = game.result(draft.state);
    if (result) {
      draft.result = result;
      draft.status = "finished";
    }
    return draft;
  });
  await store.touch(id, seat, Date.now());
  return toPlayerView(store, record, seat);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wartet höchstens `waitSeconds`, bis das Match eine andere Version als
 * `since` hat. Gibt `null` zurück, wenn sich in der Zeit nichts getan hat.
 * So muss ein Client nicht im Sekundentakt nachfragen.
 */
export async function waitForChange(
  store: MatchStore,
  id: string,
  since: number,
  waitSeconds: number,
  intervalMs = 1000,
): Promise<MatchRecord | null> {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    const record = await load(store, id);
    if (record.version !== since) return record;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await sleep(Math.min(intervalMs, remaining));
  }
}
