import { getArena } from "@/lib/arena/arena";
import type { JoinResponse } from "@/lib/arena/api-types-v2";
import { handle, json, readBody } from "@/lib/http";

/** Besetzt einen offenen Platz. Body: `{ "name"?: string }`. */
export function POST(request: Request, ctx: RouteContext<"/api/matches/[id]/join">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readBody(request);
    const arena = getArena();
    const { seat, token } = arena.join(id, body.name);
    const match = arena.getMatch(id);
    return json({ seat, token, match: arena.info(match), map: match.map } satisfies JoinResponse, 201);
  });
}
