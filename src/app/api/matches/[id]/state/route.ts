import { getArena } from "@/lib/arena/arena";
import { bearer, handle, json, noChange, waitParam } from "@/lib/http";

/**
 * Stand aus Sicht eines Bots (Bearer-Token). Mit `wait` hält der Aufruf, bis
 * der Bot am Zug ist oder das Match vorbei ist. Nach der Frist einer Runde
 * ist er erst in der nächsten wieder am Zug.
 */
export function GET(request: Request, ctx: RouteContext<"/api/matches/[id]/state">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const wait = waitParam(request);
    const arena = getArena();
    const { match, seat } = arena.authenticate(id, bearer(request));
    if (wait !== null) {
      const ready = () =>
        match.status === "finished" ||
        match.status === "aborted" ||
        (match.status === "running" && match.seats[seat].pending === null && Date.now() <= match.deadlineAt);
      const ok = await arena.wait(match, ready, wait);
      arena.authenticate(id, bearer(request));
      if (!ok) return noChange();
    }
    return json(arena.playerState(match, seat));
  });
}
