import { getArena } from "@/lib/arena/arena";
import type { OrdersResponse } from "@/lib/arena/api-types";
import { bearer, handle, json, readBody, waitParam } from "@/lib/http";

/**
 * Reicht die Befehle eines Bots für einen Tick ein. Body: `OrdersRequest`.
 * Mit `wait` hält der Aufruf, bis der Tick aufgelöst ist, und liefert den
 * nächsten Stand gleich mit.
 */
export function POST(request: Request, ctx: RouteContext<"/api/matches/[id]/orders">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const wait = waitParam(request);
    const arena = getArena();
    const { match, seat } = arena.authenticate(id, bearer(request));
    const body = await readBody(request);
    const answer = arena.submitOrders(match, seat, body.tick, body.orders);
    let state: OrdersResponse["state"] = null;
    if (wait !== null) {
      const ready = () => match.state.tick > answer.tick || match.status !== "running";
      if (await arena.wait(match, ready, wait)) {
        arena.authenticate(id, bearer(request));
        state = arena.playerState(match, seat);
      }
    }
    return json({ ...answer, state } satisfies OrdersResponse);
  });
}
