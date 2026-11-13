import type { SeriesListResponse, SeriesResponse } from "@/lib/arena/api-types";
import { seriesBriefing } from "@/lib/arena/briefing";
import { getSeries } from "@/lib/arena/series";
import { baseUrl, handle, intParam, json, readBody, requireArenaKey } from "@/lib/http";

/** Liste der Serien, die der Server kennt, neueste zuerst. */
export function GET(request: Request) {
  return handle(() => {
    const limit = Math.min(intParam(request, "limit", 50), 100);
    return json({ series: getSeries().list(limit) } satisfies SeriesListResponse);
  });
}

/** Legt eine Serie an. Body: `CreateSeriesRequest`. */
export function POST(request: Request) {
  return handle(async () => {
    requireArenaKey(request);
    const manager = getSeries();
    const series = manager.create(await readBody(request));
    return json(
      { series: manager.info(series), briefing: seriesBriefing(baseUrl(request), series.id) } satisfies SeriesResponse,
      201,
    );
  });
}
