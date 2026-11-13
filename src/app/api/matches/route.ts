import { getArena } from "@/lib/arena/arena";
import type { MatchListResponse, MatchResponse } from "@/lib/arena/api-types";
import { matchBriefing } from "@/lib/arena/briefing";
import { baseUrl, handle, intParam, json, readBody, requireArenaKey } from "@/lib/http";

/** Liste der Matches, die der Server kennt, neueste zuerst. */
export function GET(request: Request) {
  return handle(() => {
    const limit = Math.min(intParam(request, "limit", 50), 200);
    return json({ matches: getArena().listMatches(limit) } satisfies MatchListResponse);
  });
}

/** Legt ein Match an. Body: `CreateMatchRequest`. */
export function POST(request: Request) {
  return handle(async () => {
    requireArenaKey(request);
    const arena = getArena();
    const match = arena.createMatch(await readBody(request));
    return json(
      { match: arena.info(match), map: match.map, briefing: matchBriefing(baseUrl(request), match.id) } satisfies MatchResponse,
      201,
    );
  });
}
