import { getArena } from "@/lib/arena/arena";
import type { MatchResponse } from "@/lib/arena/api-types-v2";
import { matchBriefing } from "@/lib/arena/briefing";
import { baseUrl, handle, json } from "@/lib/http";

/** Kopf, Karte und Auftragstext eines Matches. */
export function GET(request: Request, ctx: RouteContext<"/api/matches/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const arena = getArena();
    const match = arena.getMatch(id);
    return json({
      match: arena.info(match),
      map: match.map,
      briefing: matchBriefing(baseUrl(request), match.id),
    } satisfies MatchResponse);
  });
}
