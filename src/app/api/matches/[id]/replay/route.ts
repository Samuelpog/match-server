import { getArena } from "@/lib/arena/arena";
import { handle, intParam, json, noChange, waitParam } from "@/lib/http";

/**
 * Frames ab Tick `from`: Live-Strom und Replay in einem. Mit `wait` hält der
 * Aufruf, bis es neue Frames gibt oder das Match endet, mit `since` auch bis
 * sich nur der Kopf des Matches ändert. Kommt nichts, antwortet er mit 204.
 */
export function GET(request: Request, ctx: RouteContext<"/api/matches/[id]/replay">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const from = intParam(request, "from", 0);
    const since = intParam(request, "since", null);
    const wait = waitParam(request);
    const arena = getArena();
    const match = arena.getMatch(id);
    if (wait !== null) {
      const over = () => match.status === "finished" || match.status === "aborted";
      const ready = () => match.frames.length > from || (since === null ? over() : match.version > since);
      if (!(await arena.wait(match, ready, wait))) return noChange();
    }
    return json(arena.replay(match, from));
  });
}
