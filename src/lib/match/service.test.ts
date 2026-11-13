import { beforeEach, describe, expect, it } from "vitest";
import { MatchError } from "./errors";
import {
  createMatch,
  getPlayerView,
  getPublicView,
  joinMatch,
  submitMove,
  waitForChange,
} from "./service";
import { MemoryStore } from "./store";

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
});

async function expectError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MatchError);
  expect((error as MatchError).code).toBe(code);
  expect((error as MatchError).status).toBe(status);
}

async function runningMatch() {
  const match = await createMatch(store);
  const a = await joinMatch(store, match.id, "Cloud A");
  const b = await joinMatch(store, match.id, "Cloud B");
  return { id: match.id, a, b };
}

describe("Match anlegen", () => {
  it("startet wartend, ohne Spieler, mit Version 1", async () => {
    const match = await createMatch(store);
    const view = await getPublicView(store, match.id);
    expect(view.status).toBe("waiting");
    expect(view.version).toBe(1);
    expect(view.seats.map((s) => s.joined)).toEqual([false, false]);
    expect(view.turn).toBeNull();
  });

  it("lehnt ein unbekanntes Spiel ab", async () => {
    await expectError(createMatch(store, "gibt-es-nicht"), "unknown_game", 400);
  });

  it("meldet ein unbekanntes Match als 404", async () => {
    await expectError(getPublicView(store, "nope"), "match_not_found", 404);
  });
});

describe("Beitreten", () => {
  it("vergibt die Sitzplätze der Reihe nach und startet beim zweiten Spieler", async () => {
    const match = await createMatch(store);
    const a = await joinMatch(store, match.id, "Cloud A");
    expect(a.seat).toBe(0);
    expect((await getPublicView(store, match.id)).status).toBe("waiting");

    const b = await joinMatch(store, match.id, "Cloud B");
    expect(b.seat).toBe(1);
    expect(a.token).not.toBe(b.token);

    const view = await getPublicView(store, match.id);
    expect(view.status).toBe("running");
    expect(view.turn).toBe(0);
    expect(view.seats.map((s) => s.name)).toEqual(["Cloud A", "Cloud B"]);
  });

  it("lehnt einen dritten Spieler ab", async () => {
    const { id } = await runningMatch();
    await expectError(joinMatch(store, id, "Cloud C"), "match_full", 409);
  });

  it("vergibt einen Ersatznamen und kürzt überlange Namen", async () => {
    const match = await createMatch(store);
    await joinMatch(store, match.id, "   ");
    await joinMatch(store, match.id, "x".repeat(200));
    const view = await getPublicView(store, match.id);
    expect(view.seats[0].name).toBe("Spieler 1");
    expect(view.seats[1].name).toHaveLength(40);
  });
});

describe("Sichten", () => {
  it("gibt in keiner Sicht Token oder Token-Hash heraus", async () => {
    const { id, a } = await runningMatch();
    const publicJson = JSON.stringify(await getPublicView(store, id));
    const playerJson = JSON.stringify(await getPlayerView(store, id, a.token));
    for (const json of [publicJson, playerJson]) {
      expect(json).not.toContain("tokenHash");
      expect(json).not.toContain(a.token);
    }
  });

  it("zeigt dem Spieler seinen Sitzplatz und ob er am Zug ist", async () => {
    const { id, a, b } = await runningMatch();
    expect((await getPlayerView(store, id, a.token)).you).toEqual({ seat: 0, yourTurn: true });
    expect((await getPlayerView(store, id, b.token)).you).toEqual({ seat: 1, yourTurn: false });
  });

  it("lehnt ein falsches oder fehlendes Token ab", async () => {
    const { id } = await runningMatch();
    await expectError(getPlayerView(store, id, "falsch"), "unauthorized", 401);
    await expectError(getPlayerView(store, id, null), "unauthorized", 401);
  });

  it("markiert einen Spieler als online, sobald er sich gemeldet hat", async () => {
    const { id, a } = await runningMatch();
    await getPlayerView(store, id, a.token);
    const view = await getPublicView(store, id);
    expect(view.seats[0].online).toBe(true);
    expect(view.seats[0].lastSeenAt).toBeTypeOf("number");
  });
});

describe("Ziehen", () => {
  it("wendet einen Zug an, erhöht die Version und wechselt den Spieler", async () => {
    const { id, a } = await runningMatch();
    const before = await getPublicView(store, id);
    const after = await submitMove(store, id, a.token, { feld: "B4" });
    expect(after.version).toBe(before.version + 1);
    expect(after.turn).toBe(1);
    expect(after.moveCount).toBe(1);
    expect(after.log[0]).toMatchObject({ n: 1, seat: 0, event: { feld: "B4" } });
  });

  it("lehnt einen Zug außer der Reihe ab", async () => {
    const { id, b } = await runningMatch();
    await expectError(submitMove(store, id, b.token, { feld: "A1" }), "not_your_turn", 409);
  });

  it("lehnt Züge ab, solange das Match nicht läuft", async () => {
    const match = await createMatch(store);
    const a = await joinMatch(store, match.id, "Cloud A");
    await expectError(submitMove(store, match.id, a.token, { feld: "A1" }), "match_not_running", 409);
  });

  it("meldet einen ungültigen Zug als 422 und ändert nichts", async () => {
    const { id, a } = await runningMatch();
    const before = await getPublicView(store, id);
    await expectError(submitMove(store, id, a.token, "kein objekt"), "invalid_move", 422);
    await expectError(submitMove(store, id, a.token, undefined), "bad_request", 400);
    expect((await getPublicView(store, id)).version).toBe(before.version);
  });

  it("zieht bei wiederholter moveId nicht doppelt", async () => {
    const { id, a } = await runningMatch();
    const first = await submitMove(store, id, a.token, { feld: "B4" }, "zug-1");
    const again = await submitMove(store, id, a.token, { feld: "B4" }, "zug-1");
    expect(again.version).toBe(first.version);
    expect(again.moveCount).toBe(1);
  });

  it("beendet das Match, wenn das Spiel ein Ergebnis meldet", async () => {
    const { id, a, b } = await runningMatch();
    const view = await submitMove(store, id, a.token, { aufgeben: true });
    expect(view.status).toBe("finished");
    expect(view.result).toMatchObject({ winner: 1 });
    expect(view.turn).toBeNull();
    await expectError(submitMove(store, id, b.token, { feld: "A1" }), "match_not_running", 409);
  });
});

describe("Auf Änderungen warten", () => {
  it("meldet sofort, wenn der Client einen alten Stand hat", async () => {
    const { id } = await runningMatch();
    const record = await waitForChange(store, id, 1, 0);
    expect(record?.version).toBe(3);
  });

  it("meldet nichts, wenn sich in der Wartezeit nichts ändert", async () => {
    const { id } = await runningMatch();
    expect(await waitForChange(store, id, 3, 0)).toBeNull();
  });

  it("kehrt zurück, sobald während des Wartens ein Zug kommt", async () => {
    const { id, a } = await runningMatch();
    const waiting = waitForChange(store, id, 3, 5, 20);
    await submitMove(store, id, a.token, { feld: "C3" });
    expect((await waiting)?.version).toBe(4);
  });
});

describe("Speicher", () => {
  it("überschreibt nicht, wenn die erwartete Version veraltet ist", async () => {
    const match = await createMatch(store);
    const stale = await store.get(match.id);
    await joinMatch(store, match.id, "Cloud A");
    const written = await store.update({ ...stale!, version: 2 }, 1);
    expect(written).toBe(false);
    expect((await store.get(match.id))?.seats[0]?.name).toBe("Cloud A");
  });

  it("gibt Kopien heraus, damit niemand den gespeicherten Stand verändert", async () => {
    const match = await createMatch(store);
    const copy = await store.get(match.id);
    copy!.status = "finished";
    expect((await store.get(match.id))?.status).toBe("waiting");
  });
});
