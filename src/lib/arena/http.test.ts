import { afterEach, describe, expect, it } from "vitest";
import { POST as abortRoute } from "@/app/api/matches/[id]/abort/route";
import { POST as joinRoute } from "@/app/api/matches/[id]/join/route";
import { POST as ordersRoute } from "@/app/api/matches/[id]/orders/route";
import { GET as replayRoute } from "@/app/api/matches/[id]/replay/route";
import { GET as matchRoute } from "@/app/api/matches/[id]/route";
import { GET as stateRoute } from "@/app/api/matches/[id]/state/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/matches/route";
import type { JoinResponse, MatchResponse, OrdersResponse, PlayerState, ReplayResponse } from "./api-types-v2";
import { getArena } from "./arena";

const BASE = "http://arena.test";

function request(method: string, path: string, options: { body?: unknown; token?: string; key?: string } = {}) {
  return new Request(BASE + path, {
    method,
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.key ? { "x-arena-key": options.key } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function create(body: unknown = {}, key?: string) {
  const response = await createRoute(request("POST", "/api/matches", { body, key }));
  return { response, data: (await response.json()) as MatchResponse };
}

async function join(id: string, name: string) {
  const response = await joinRoute(request("POST", `/api/matches/${id}/join`, { body: { name } }), ctx(id));
  return (await response.json()) as JoinResponse;
}

afterEach(() => {
  delete process.env.ARENA_KEY;
  const arena = getArena();
  for (const match of arena.listMatches(200)) {
    if (match.status === "waiting" || match.status === "running") arena.abort(match.id);
  }
});

describe("HTTP: Matches", () => {
  it("legt ein Match an und liefert Kopf, Karte und Auftragstext", async () => {
    const { response, data } = await create({ options: { seed: 9 }, label: "Test" });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(data.match).toMatchObject({ status: "waiting", seed: 9, label: "Test", round: 0 });
    expect(data.map.planets).toHaveLength(15);
    expect(data.briefing).toContain(`${BASE}/api/matches/${data.match.id}/join`);

    const again = await matchRoute(request("GET", `/api/matches/${data.match.id}`), ctx(data.match.id));
    expect(((await again.json()) as MatchResponse).match.id).toBe(data.match.id);

    const list = await listRoute(request("GET", "/api/matches?limit=5"));
    expect(((await list.json()) as { matches: { id: string }[] }).matches[0].id).toBe(data.match.id);
  });

  it("antwortet auf ein unbekanntes Match mit 404 und festem Code", async () => {
    const response = await matchRoute(request("GET", "/api/matches/gibtsnicht"), ctx("gibtsnicht"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "match_not_found" } });
  });

  it("lehnt kaputte Bodys und falsche Werte mit 400 ab", async () => {
    const broken = await createRoute(
      new Request(BASE + "/api/matches", { method: "POST", body: "{kein json", headers: { "content-type": "application/json" } }),
    );
    expect(broken.status).toBe(400);
    const { response } = await create({ options: { planets: 99 } });
    expect(response.status).toBe(400);
  });

  it("verlangt den Arena-Schlüssel nur, wenn einer gesetzt ist", async () => {
    process.env.ARENA_KEY = "geheim-123";
    expect((await create({})).response.status).toBe(401);
    expect((await create({}, "falsch")).response.status).toBe(401);
    const ok = await create({}, "geheim-123");
    expect(ok.response.status).toBe(201);
    const id = ok.data.match.id;
    expect((await abortRoute(request("POST", `/api/matches/${id}/abort`), ctx(id))).status).toBe(401);
    expect((await abortRoute(request("POST", `/api/matches/${id}/abort`, { key: "geheim-123" }), ctx(id))).status).toBe(200);
    // Lesen und Beitreten bleiben offen.
    expect((await matchRoute(request("GET", `/api/matches/${id}`), ctx(id))).status).toBe(200);
  });
});

describe("HTTP: Zuschauer", () => {
  it("liefert Frames ab `from` und wartet auf neue", async () => {
    const { data } = await create({ demo: true, options: { seed: 2026, roundMs: 100 } });
    const id = data.match.id;
    const first = (await (await replayRoute(request("GET", `/api/matches/${id}/replay`), ctx(id))).json()) as ReplayResponse;
    expect(first.frames[0].round).toBe(0);
    expect(first.version).toBe(2);

    const started = Date.now();
    const next = await replayRoute(request("GET", `/api/matches/${id}/replay?from=${first.next + 2}&wait=5`), ctx(id));
    expect(next.status).toBe(200);
    const body = (await next.json()) as ReplayResponse;
    expect(body.frames[0].round).toBe(first.next + 2);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("antwortet mit 204, wenn in der Wartezeit nichts geschieht", async () => {
    const { data } = await create({});
    const id = data.match.id;
    const response = await replayRoute(request("GET", `/api/matches/${id}/replay?from=1&wait=0.2`), ctx(id));
    expect(response.status).toBe(204);
  });

  it("meldet mit `since` auch Änderungen am Kopf, mit leerem `frames`", async () => {
    const { data } = await create({});
    const id = data.match.id;
    const pending = replayRoute(
      request("GET", `/api/matches/${id}/replay?from=1&since=${data.match.version}&wait=5`),
      ctx(id),
    );
    await join(id, "Alpha");
    const body = (await (await pending).json()) as ReplayResponse;
    expect(body.frames).toEqual([]);
    expect(body.match.players[0]).toMatchObject({ name: "Alpha", joined: true });
    expect(body.match.version).toBeGreaterThan(data.match.version);
  });
});

describe("HTTP: Bots", () => {
  it("spielt eine Runde über join, state und orders", async () => {
    const { data } = await create({ options: { seed: 7, roundMs: 100, timeoutMs: 500 } });
    const id = data.match.id;
    const a = await join(id, "Alpha");
    const b = await join(id, "Beta");
    expect([a.seat, b.seat]).toEqual([0, 1]);
    expect(b.match.status).toBe("running");

    const stateA = (await (
      await stateRoute(request("GET", `/api/matches/${id}/state?wait=5`, { token: a.token }), ctx(id))
    ).json()) as PlayerState;
    expect(stateA).toMatchObject({ you: 0, round: 1, submitted: false, actions: { limit: 3 } });
    const neighbor = a.map.routes.find(([from]) => from === 0)![1];
    const good = { type: "move", from: 0, to: neighbor, ships: 10 };
    const bad = { type: "move", from: 1, to: neighbor, ships: 1 };

    const [answerA, answerB] = await Promise.all(
      [a, b].map(async (player, seat) => {
        const response = await ordersRoute(
          request("POST", `/api/matches/${id}/orders?wait=5`, {
            token: player.token,
            body: { round: 1, actions: seat === 0 ? [good, bad] : [] },
          }),
          ctx(id),
        );
        return (await response.json()) as OrdersResponse;
      }),
    );
    expect(answerA.accepted).toBe(1);
    expect(answerA.results).toEqual([
      { action: good, ok: true },
      { action: bad, ok: false, code: "not_owner" },
    ]);
    expect(answerA.state).toMatchObject({ round: 2, you: 0, submitted: false });
    expect(answerB.state).toMatchObject({ round: 2, you: 1 });
    expect(answerA.state!.fleets).toHaveLength(1);

    const stale = await ordersRoute(
      request("POST", `/api/matches/${id}/orders`, { token: a.token, body: { round: 1, actions: [] } }),
      ctx(id),
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "stale_round", round: 2 } });
  });

  it("weist falsche Tokens ab", async () => {
    const { data } = await create({});
    const id = data.match.id;
    await join(id, "Alpha");
    const response = await stateRoute(request("GET", `/api/matches/${id}/state`, { token: "falsch" }), ctx(id));
    expect(response.status).toBe(401);
    const none = await stateRoute(request("GET", `/api/matches/${id}/state`), ctx(id));
    expect(none.status).toBe(401);
  });

  it("lässt `state` mit wait warten, bis das Match startet", async () => {
    const { data } = await create({});
    const id = data.match.id;
    const a = await join(id, "Alpha");
    const quick = await stateRoute(request("GET", `/api/matches/${id}/state?wait=0.2`, { token: a.token }), ctx(id));
    expect(quick.status).toBe(204);
    const pending = stateRoute(request("GET", `/api/matches/${id}/state?wait=5`, { token: a.token }), ctx(id));
    await join(id, "Beta");
    const state = (await (await pending).json()) as PlayerState;
    expect(state.match.status).toBe("running");
    expect(state.deadlineMs).toBeGreaterThan(4000);
  });
});

describe("HTTP: Serien", () => {
  it("führt zwei Bots durch eine Serie: beitreten, Zuteilung holen, mit demselben Token spielen", async () => {
    const { POST: createSeries } = await import("@/app/api/series/route");
    const { GET: seriesRoute } = await import("@/app/api/series/[id]/route");
    const { POST: seriesJoin } = await import("@/app/api/series/[id]/join/route");
    const { GET: meRoute } = await import("@/app/api/series/[id]/me/route");
    const { POST: seriesAbort } = await import("@/app/api/series/[id]/abort/route");

    const created = await createSeries(
      request("POST", "/api/series", { body: { bestOf: 3, options: { seed: 50, roundMs: 100, timeoutMs: 500 }, label: "Finale" } }),
    );
    expect(created.status).toBe(201);
    const { series, briefing } = (await created.json()) as { series: { id: string; version: number }; briefing: string };
    expect(briefing).toContain(`/api/series/${series.id}/join`);
    const id = series.id;

    const joinSeries = async (name: string) =>
      (await (await seriesJoin(request("POST", `/api/series/${id}/join`, { body: { name } }), ctx(id))).json()) as {
        slot: number;
        token: string;
      };
    const a = await joinSeries("Alpha");
    const early = await meRoute(request("GET", `/api/series/${id}/me?wait=0.2`, { token: a.token }), ctx(id));
    expect(early.status).toBe(204);

    const pending = meRoute(request("GET", `/api/series/${id}/me?wait=5&after=`, { token: a.token }), ctx(id));
    const b = await joinSeries("Beta");
    const me = (await (await pending).json()) as { you: number; current: { matchId: string; seat: number } };
    expect(me.you).toBe(0);
    expect(me.current.seat).toBe(0);

    // Das Serien-Token gilt im Match.
    const state = await stateRoute(
      request("GET", `/api/matches/${me.current.matchId}/state?wait=5`, { token: b.token }),
      ctx(me.current.matchId),
    );
    expect(((await state.json()) as PlayerState).you).toBe(1);

    const info = (await (await seriesRoute(request("GET", `/api/series/${id}`), ctx(id))).json()) as {
      series: { status: string; current: string; players: { name: string }[] };
    };
    expect(info.series).toMatchObject({ status: "running", current: me.current.matchId });
    expect(info.series.players.map((player) => player.name)).toEqual(["Alpha", "Beta"]);

    const aborted = await seriesAbort(request("POST", `/api/series/${id}/abort`), ctx(id));
    expect(((await aborted.json()) as { series: { status: string } }).series.status).toBe("aborted");
    const after = await meRoute(request("GET", `/api/series/${id}/me?wait=5`, { token: a.token }), ctx(id));
    expect(((await after.json()) as { series: { status: string }; current: null }).current).toBeNull();
  });

  it("antwortet auf eine unbekannte Serie mit 404 und festem Code", async () => {
    const { GET: seriesRoute } = await import("@/app/api/series/[id]/route");
    const response = await seriesRoute(request("GET", "/api/series/gibtsnicht"), ctx("gibtsnicht"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "series_not_found" } });
  });
});
