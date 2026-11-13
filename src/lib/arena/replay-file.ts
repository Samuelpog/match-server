import type { Frame, GameMap, GameResult } from "@/lib/planetwars/types";
import type { MatchInfo, MatchOptions, PlayerInfo, ReplayResponse } from "./api-types";

/** Standardwerte für Takt und Frist, siehe `docs/API.md`. */
export const TIMING_DEFAULTS = { tickMs: 300, timeoutMs: 2000 } as const;

export interface ReplayFileInput {
  id: string;
  map: GameMap;
  frames: Frame[];
  result: GameResult;
  /** Namen der beiden Sitze. */
  names: [string, string];
  /** Kennungen eingebauter Bots, `null` für externe. */
  bots?: [string | null, string | null];
  options?: Partial<Pick<MatchOptions, "tickLimit" | "tickMs" | "timeoutMs">>;
  label?: string | null;
  createdAt?: number;
}

/**
 * Baut aus einem lokal simulierten Match eine Replay-Datei im selben Format,
 * das `GET /api/matches/{id}/replay?from=0` liefert. So lässt sich ein Match
 * ohne Server spielen und im Browser ansehen. Reine Funktion.
 */
export function replayFile(input: ReplayFileInput): ReplayResponse {
  const { map, frames, result } = input;
  const last = frames[frames.length - 1];
  const createdAt = input.createdAt ?? 0;
  const player = (seat: 0 | 1): PlayerInfo => {
    const bot = input.bots?.[seat] ?? null;
    return { seat, name: input.names[seat], kind: bot ? "bot" : "external", bot, joined: true, online: false, absent: false };
  };
  const match: MatchInfo = {
    id: input.id,
    status: result.reason === "aborted" ? "aborted" : "finished",
    version: frames.length + 1,
    tick: last.t,
    tickLimit: input.options?.tickLimit ?? Math.max(last.t, 1),
    tickMs: input.options?.tickMs ?? TIMING_DEFAULTS.tickMs,
    timeoutMs: input.options?.timeoutMs ?? TIMING_DEFAULTS.timeoutMs,
    seed: map.seed,
    players: [player(0), player(1)],
    result,
    series: null,
    label: input.label ?? null,
    createdAt,
    startedAt: createdAt,
    finishedAt: createdAt + last.at,
  };
  return { format: "planetwars-replay", version: 1, match, map, frames, next: last.t + 1 };
}
