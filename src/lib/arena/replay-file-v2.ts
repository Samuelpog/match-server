import { PARAMS, RULES, type Frame, type GameMap, type GameResult } from "@/lib/game/types";
import type { MatchInfo, MatchOptions, PlayerInfo, ReplayResponse } from "./api-types-v2";

/** Voreinstellungen für Takt und Frist, siehe `a-0004` Abschnitt 3. */
export const PRESETS = {
  turnier: { roundMs: 8000, timeoutMs: 5000 },
  test: { roundMs: 100, timeoutMs: 2000 },
} as const;

export interface ReplayFileInput {
  id: string;
  map: GameMap;
  frames: Frame[];
  result: GameResult;
  /** Namen der beiden Sitze. */
  names: [string, string];
  /** Kennungen eingebauter Bots, `null` für externe. */
  bots?: [string | null, string | null];
  options?: Partial<Pick<MatchOptions, "rounds" | "roundMs" | "timeoutMs">>;
  label?: string | null;
  createdAt?: number;
}

/**
 * Baut aus einem lokal simulierten Match eine Replay-Datei im selben Format,
 * das `GET /api/matches/{id}/replay?from=0` liefert. So lässt sich ein Match
 * ohne Server spielen und im Browser ansehen. Reine Funktion, läuft auch im Browser.
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
    rules: RULES,
    params: PARAMS,
    round: last.round,
    rounds: input.options?.rounds ?? Math.max(last.round, 1),
    roundMs: input.options?.roundMs ?? PRESETS.turnier.roundMs,
    timeoutMs: input.options?.timeoutMs ?? PRESETS.turnier.timeoutMs,
    seed: map.seed,
    players: [player(0), player(1)],
    result,
    series: null,
    label: input.label ?? null,
    createdAt,
    startedAt: createdAt,
    finishedAt: createdAt + last.at,
  };
  return { format: "planetwars-replay", version: 2, match, map, frames, next: last.round + 1 };
}
