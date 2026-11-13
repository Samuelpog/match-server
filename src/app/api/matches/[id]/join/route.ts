import { handle, json, readBody } from "@/lib/http";
import { joinMatch } from "@/lib/match/service";
import { getStore } from "@/lib/match/store";

/** Besetzt den nächsten freien Sitzplatz. Body: `{ "name"?: string }`. Das Token kommt nur hier zurück. */
export function POST(request: Request, ctx: RouteContext<"/api/matches/[id]/join">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readBody(request);
    return json(await joinMatch(getStore(), id, body.name), 201);
  });
}
