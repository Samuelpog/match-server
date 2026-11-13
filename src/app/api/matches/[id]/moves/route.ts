import { bearer, handle, json, readBody } from "@/lib/http";
import { errors } from "@/lib/match/errors";
import { submitMove } from "@/lib/match/service";
import { getStore } from "@/lib/match/store";

/** Sendet einen Zug (Bearer-Token). Body: `{ "move": <JSON>, "moveId"?: string }`. */
export function POST(request: Request, ctx: RouteContext<"/api/matches/[id]/moves">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readBody(request);
    if (body.moveId !== undefined && typeof body.moveId !== "string") {
      throw errors.badRequest('"moveId" muss ein Text sein.');
    }
    return json(await submitMove(getStore(), id, bearer(request), body.move, body.moveId));
  });
}
