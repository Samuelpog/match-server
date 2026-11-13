import type { MatchView } from "@/lib/match/types";

export interface Health {
  ok: boolean;
  store: "memory" | "redis";
  durable: boolean;
  createKeyRequired: boolean;
  games: { id: string; name: string; seats: number }[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function toError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return new ApiError(
    response.status,
    body?.error?.code ?? "unknown",
    body?.error?.message ?? `Der Server antwortet mit Fehler ${response.status}.`,
  );
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch("/api/health", { cache: "no-store", signal });
  if (!response.ok) throw await toError(response);
  return response.json();
}

export async function createMatch(createKey?: string): Promise<MatchView> {
  const response = await fetch("/api/matches", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(createKey ? { authorization: `Bearer ${createKey}` } : {}),
    },
    body: "{}",
  });
  if (!response.ok) throw await toError(response);
  return ((await response.json()) as { match: MatchView }).match;
}

/**
 * Holt den öffentlichen Stand. Mit `since` wartet der Server bis zu
 * `waitSeconds` auf eine Änderung und antwortet sonst mit `null`.
 */
export async function fetchMatch(
  id: string,
  options: { since?: number; waitSeconds?: number; signal?: AbortSignal } = {},
): Promise<MatchView | null> {
  const query = options.since === undefined ? "" : `?since=${options.since}&wait=${options.waitSeconds ?? 0}`;
  const response = await fetch(`/api/matches/${encodeURIComponent(id)}${query}`, {
    cache: "no-store",
    signal: options.signal,
  });
  if (response.status === 204) return null;
  if (!response.ok) throw await toError(response);
  return response.json();
}
