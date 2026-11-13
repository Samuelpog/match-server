import type { SeriesResponse } from "@/lib/arena/api-types";
import { seriesBriefing } from "@/lib/arena/briefing";
import { getSeries } from "@/lib/arena/series";
import { baseUrl, handle, intParam, json, noChange, waitParam } from "@/lib/http";

/**
 * Stand einer Serie: Teilnehmer, Siege, Spiele, laufendes Match. Mit
 * `since=<version>&wait=<s>` hält der Aufruf, bis sich etwas ändert.
 */
export function GET(request: Request, ctx: RouteContext<"/api/series/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const since = intParam(request, "since", null);
    const wait = waitParam(request);
    const manager = getSeries();
    const series = manager.get(id);
    if (since !== null && wait !== null && !(await manager.wait(series, () => series.version > since, wait))) {
      return noChange();
    }
    return json({
      series: manager.info(series),
      briefing: seriesBriefing(baseUrl(request), series.id),
    } satisfies SeriesResponse);
  });
}
