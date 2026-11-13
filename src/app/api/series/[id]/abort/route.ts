import { getSeries } from "@/lib/arena/series";
import { handle, json, requireArenaKey } from "@/lib/http";

/** Bricht eine Serie ab, samt laufendem Match. */
export function POST(request: Request, ctx: RouteContext<"/api/series/[id]/abort">) {
  return handle(async () => {
    requireArenaKey(request);
    const { id } = await ctx.params;
    const manager = getSeries();
    return json({ series: manager.info(manager.abort(id)) });
  });
}
