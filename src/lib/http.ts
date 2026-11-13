import { timingSafeEqual } from "node:crypto";
import { ARENA_LIMITS } from "@/lib/arena/arena";
import { ArenaError, errors } from "@/lib/arena/errors";

/** Größter Body, den der Server liest. */
const MAX_BODY_BYTES = 64 * 1024;

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function noChange() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/** Führt einen Handler aus und übersetzt Fehler in eine einheitliche JSON-Antwort. */
export async function handle(run: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ArenaError) {
      return json({ error: { code: error.code, message: error.message, ...error.details } }, error.status);
    }
    console.error(error);
    return json({ error: { code: "internal_error", message: "Interner Fehler im Match-Server." } }, 500);
  }
}

export function bearer(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1].trim() : null;
}

/**
 * Prüft den Arena-Schlüssel im Kopf `X-Arena-Key`. Ist beim Server kein
 * `ARENA_KEY` gesetzt, ist alles erlaubt.
 */
export function requireArenaKey(request: Request) {
  const expected = process.env.ARENA_KEY;
  if (!expected) return;
  const given = Buffer.from(request.headers.get("x-arena-key") ?? "");
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw errors.arenaKey();
}

/** Liest den JSON-Body. Ein leerer Body zählt als leeres Objekt. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw errors.tooLarge();
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

/** Liest einen ganzzahligen Parameter ab 0. Fehlt er, gilt `fallback`. */
export function intParam<T extends number | null>(request: Request, name: string, fallback: T): number | T {
  const raw = new URL(request.url).searchParams.get(name);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw errors.badRequest(`"${name}" muss eine ganze Zahl ab 0 sein.`);
  return value;
}

/** Liest `?wait=` in Millisekunden, gedeckelt auf die längste Wartezeit. `null`, wenn der Parameter fehlt. */
export function waitParam(request: Request): number | null {
  const raw = new URL(request.url).searchParams.get("wait");
  if (raw === null || raw === "") return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) throw errors.badRequest('"wait" muss eine Zahl ab 0 sein.');
  return Math.min(seconds, ARENA_LIMITS.maxWaitSeconds) * 1000;
}

/** Öffentliche Adresse des Servers, für Links und Auftragstexte. */
export function baseUrl(request: Request): string {
  const fixed = process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL;
  if (fixed) return fixed.replace(/\/+$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
