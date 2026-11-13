import { handle, json, noChange, pollParams } from "@/lib/http";
import { getPublicView, waitForChange } from "@/lib/match/service";
import { getStore } from "@/lib/match/store";

/** Öffentlicher Stand für Zuschauer. Mit `?since=<version>&wait=<s>` wartet der Aufruf auf Änderungen. */
export function GET(request: Request, ctx: RouteContext<"/api/matches/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { since, wait } = pollParams(request);
    const store = getStore();
    if (since !== null && !(await waitForChange(store, id, since, wait))) return noChange();
    return json(await getPublicView(store, id));
  });
}
