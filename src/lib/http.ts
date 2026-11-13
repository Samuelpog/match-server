import { errors, MatchError } from "@/lib/match/errors";

/** Längste Wartezeit für `?wait=`, in Sekunden. */
export const MAX_WAIT_SECONDS = 25;

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function noChange() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/** Führt einen Handler aus und übersetzt Fehler in eine einheitliche JSON-Antwort. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MatchError) {
      return json({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error(error);
    return json({ error: { code: "internal_error", message: "Interner Fehler im Match-Server." } }, 500);
  }
}

export function bearer(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1].trim() : null;
}

/** Liest den JSON-Body. Ein leerer Body zählt als leeres Objekt. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw errors.badRequest("Der Body ist kein gültiges JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw errors.badRequest("Der Body muss ein JSON-Objekt sein.");
  }
  return parsed as Record<string, unknown>;
}

/** Liest `?since=` und `?wait=`. Ohne `since` wird nie gewartet. */
export function pollParams(request: Request): { since: number | null; wait: number } {
  const params = new URL(request.url).searchParams;
  const since = params.get("since");
  if (since === null) return { since: null, wait: 0 };
  const sinceNumber = Number(since);
  if (!Number.isInteger(sinceNumber) || sinceNumber < 0) {
    throw errors.badRequest('"since" muss eine Versionsnummer sein.');
  }
  const wait = Number(params.get("wait") ?? 0);
  if (!Number.isFinite(wait) || wait < 0) throw errors.badRequest('"wait" muss eine Zahl ab 0 sein.');
  return { since: sinceNumber, wait: Math.min(wait, MAX_WAIT_SECONDS) };
}
