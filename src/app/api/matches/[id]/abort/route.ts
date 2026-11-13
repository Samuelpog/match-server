import { getArena } from "@/lib/arena/arena";
import { handle, json, requireArenaKey } from "@/lib/http";

/** Bricht ein wartendes oder laufendes Match ab. */
export function POST(request: Request, ctx: RouteContext<"/api/matches/[id]/abort">) {
  return handle(async () => {
    requireArenaKey(request);
    const { id } = await ctx.params;
    const arena = getArena();
    return json({ match: arena.info(arena.abort(id)) });
  });
}
