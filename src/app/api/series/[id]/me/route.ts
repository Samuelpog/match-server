import { getSeries } from "@/lib/arena/series";
import { bearer, handle, json, noChange, waitParam } from "@/lib/http";

/**
 * Für Bots (Bearer-Token): in welchem Match und auf welchem Sitz es
 * weitergeht. Mit `wait` hält der Aufruf, bis ein Match läuft oder die Serie
 * vorbei ist. Mit `after=<matchId>` zählt das genannte Match nicht mehr, so
 * wartet ein Bot nach einem Spiel auf das nächste.
 */
export function GET(request: Request, ctx: RouteContext<"/api/series/[id]/me">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const wait = waitParam(request);
    const after = new URL(request.url).searchParams.get("after");
    const manager = getSeries();
    const { series, slot } = manager.authenticate(id, bearer(request));
    if (wait !== null) {
      const ready = () => {
        if (series.status === "finished" || series.status === "aborted") return true;
        const current = manager.assignment(series, slot);
        return current !== null && current.matchId !== after;
      };
      const ok = await manager.wait(series, ready, wait);
      manager.authenticate(id, bearer(request));
      if (!ok) return noChange();
    }
    return json(manager.playerState(series, slot));
  });
}
