import { bearer, handle, json, noChange, pollParams } from "@/lib/http";
import { authenticate, getPlayerView, waitForChange } from "@/lib/match/service";
import { getStore } from "@/lib/match/store";

/** Stand aus Sicht eines Spielers (Bearer-Token). Mit `?since=<version>&wait=<s>` wartet der Aufruf auf Änderungen. */
export function GET(request: Request, ctx: RouteContext<"/api/matches/[id]/me">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const token = bearer(request);
    const { since, wait } = pollParams(request);
    const store = getStore();
    await authenticate(store, id, token);
    if (since !== null && !(await waitForChange(store, id, since, wait))) {
      await authenticate(store, id, token);
      return noChange();
    }
    return json(await getPlayerView(store, id, token));
  });
}
