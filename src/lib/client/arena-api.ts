import type {
  CreateMatchRequest,
  CreateSeriesRequest,
  ErrorResponse,
  HealthResponse,
  MatchInfo,
  MatchListResponse,
  MatchResponse,
  ReplayResponse,
  SeriesInfo,
  SeriesListResponse,
  SeriesResponse,
} from "@/lib/arena/api-types-v2";

/** Aufrufe der HTTP-Schnittstelle aus dem Browser. Formen und Pfade: `docs/API.md`. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const KEY_STORAGE = "planetwars:arena-key";

/** Der Arena-Schlüssel, falls der Server einen verlangt. Bleibt nur in diesem Browser. */
export function getArenaKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setArenaKey(key: string): void {
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Ohne Speicher gilt der Schlüssel nur, bis die Seite neu geladen wird.
  }
}

interface Options {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  /** Anlegen und Abbrechen: Arena-Schlüssel mitsenden, wenn einer hinterlegt ist. */
  privileged?: boolean;
}

/** `null` steht für `204`: der Server hatte in der Wartezeit nichts Neues. */
async function request<T>(path: string, options: Options = {}): Promise<T | null> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const key = options.privileged ? getArenaKey() : "";
  if (key) headers["x-arena-key"] = key;

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: options.signal,
  });
  if (response.status === 204) return null;
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as Partial<ErrorResponse> | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? "unknown",
      body?.error?.message ?? `Der Server antwortet mit Fehler ${response.status}.`,
    );
  }
  return (await response.json()) as T;
}

async function required<T>(path: string, options?: Options): Promise<T> {
  const result = await request<T>(path, options);
  if (result === null) throw new ApiError(204, "empty", "Der Server hat keine Daten gesendet.");
  return result;
}

function query(params: Record<string, number | undefined>): string {
  const parts = Object.entries(params)
    .filter((entry): entry is [string, number] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${value}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

const matchPath = (id: string) => `/api/matches/${encodeURIComponent(id)}`;
const seriesPath = (id: string) => `/api/series/${encodeURIComponent(id)}`;

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return required("/api/health", { signal });
}

export function createMatch(body: CreateMatchRequest): Promise<MatchResponse> {
  return required("/api/matches", { method: "POST", body, privileged: true });
}

export async function listMatches(signal?: AbortSignal): Promise<MatchInfo[]> {
  return (await required<MatchListResponse>("/api/matches?limit=50", { signal })).matches;
}

export function getMatch(id: string, signal?: AbortSignal): Promise<MatchResponse> {
  return required(matchPath(id), { signal });
}

/**
 * Frames ab `from`. Mit `since` kehrt der Aufruf auch zurück, wenn sich nur
 * der Kopf des Matches geändert hat. `null`: nichts Neues in der Wartezeit.
 */
export function fetchReplay(
  id: string,
  options: { from: number; since?: number; waitSeconds?: number; signal?: AbortSignal },
): Promise<ReplayResponse | null> {
  const params = query({ from: options.from, since: options.since, wait: options.waitSeconds });
  return request(`${matchPath(id)}/replay${params}`, { signal: options.signal });
}

export async function abortMatch(id: string): Promise<void> {
  await request(`${matchPath(id)}/abort`, { method: "POST", body: {}, privileged: true });
}

export function createSeries(body: CreateSeriesRequest): Promise<SeriesResponse> {
  return required("/api/series", { method: "POST", body, privileged: true });
}

export async function listSeries(signal?: AbortSignal): Promise<SeriesInfo[]> {
  return (await required<SeriesListResponse>("/api/series", { signal })).series;
}

export function getSeries(
  id: string,
  options: { since?: number; waitSeconds?: number; signal?: AbortSignal } = {},
): Promise<SeriesResponse | null> {
  const params = query({ since: options.since, wait: options.waitSeconds });
  return request(`${seriesPath(id)}${params}`, { signal: options.signal });
}

export async function abortSeries(id: string): Promise<void> {
  await request(`${seriesPath(id)}/abort`, { method: "POST", body: {}, privileged: true });
}

/** Wartet, ohne einen abgebrochenen Aufruf festzuhalten. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
