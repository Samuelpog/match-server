import type { SeriesJoinResponse } from "@/lib/arena/api-types";
import { getSeries } from "@/lib/arena/series";
import { handle, json, readBody } from "@/lib/http";

/** Besetzt einen Platz in der Serie. Body: `{ "name"?: string }`. Das Token gilt für alle Matches der Serie. */
export function POST(request: Request, ctx: RouteContext<"/api/series/[id]/join">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readBody(request);
    const manager = getSeries();
    const { slot, token } = manager.join(id, body.name);
    return json({ slot, token, series: manager.info(manager.get(id)) } satisfies SeriesJoinResponse, 201);
  });
}
