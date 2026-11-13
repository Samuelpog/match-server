#!/usr/bin/env node
/**
 * Beispiel-Bot für die Planet Wars Arena. Ohne Abhängigkeiten, Node 22 oder neuer.
 *
 * Einem Match beitreten:       node examples/bot.mjs --match <id> --name Alpha
 * Einer Serie beitreten:       node examples/bot.mjs --series <id> --name Alpha
 * Gegen einen eingebauten Bot: node examples/bot.mjs --vs standard --name Alpha
 *
 * Weitere Schalter:
 *   --strategy <Datei>  Strategie, Standard ist ./strategy.mjs neben dieser Datei
 *   --url <Adresse>     Server, sonst die Umgebungsvariable ARENA_URL, sonst http://localhost:3000
 *   --key <Schlüssel>   Arena-Schlüssel, nur für --vs
 *   --takt turnier      nur für --vs: 8 Sekunden je Runde statt des schnellen Testtakts
 *
 * Hinter einem HTTPS-Proxy (Cloud-Umgebung) mit NODE_USE_ENV_PROXY=1 starten,
 * sonst beachtet Node die Variable HTTPS_PROXY nicht.
 *
 * Fairness-Regel: Ein Bot ruft nur health, join, state, orders und me auf.
 * Diese Datei ist das Protokoll und kann so bleiben. Die Strategie steht in
 * strategy.mjs: eine Funktion, Stand hinein, Aktionen heraus. Dieselbe
 * Funktion läuft im Simulator (`npm run sim`).
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg, index, all) => (arg.startsWith("--") ? [[arg.slice(2), all[index + 1] ?? ""]] : [])),
);
const BASE = (args.url || process.env.ARENA_URL || "http://localhost:3000").replace(/\/+$/, "");
const NAME = args.name || "Beispiel-Bot";
const WAIT = 25;

const strategyUrl = args.strategy ? pathToFileURL(resolve(args.strategy)).href : new URL("./strategy.mjs", import.meta.url).href;
const { default: decide } = await import(strategyUrl);
if (typeof decide !== "function") throw new Error("Die Strategie-Datei braucht eine Funktion als Standard-Export.");

// ----------------------------------------------------------------- Protokoll

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ein Aufruf mit Wiederholung bei Netzfehlern. Gibt `null` bei 204 zurück. */
async function call(method, path, { token, body, key } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(BASE + path, {
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(key ? { "x-arena-key": key } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout((WAIT + 20) * 1000),
      });
      if (response.status === 204) return null;
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      const error = new Error(data.error?.message ?? `HTTP ${response.status}`);
      error.code = data.error?.code ?? "http_" + response.status;
      error.status = response.status;
      throw error;
    } catch (error) {
      // Antworten des Servers mit Fehlercode sind endgültig, nur Netzfehler werden wiederholt.
      if (error.status && error.status < 500) throw error;
      if (attempt >= 8) throw error;
      console.error(`  Netzfehler (${error.message}), Versuch ${attempt + 1} in ${attempt} s`);
      await sleep(attempt * 1000);
    }
  }
}

/** Weckt den Server, falls er schläft. Das kann eine Minute dauern. */
async function wake() {
  const health = await call("GET", "/api/health");
  console.log(`Server erreichbar: ${BASE} (Start-Kennung ${health.bootId})`);
  return health;
}

/** Spielt ein Match zu Ende und gibt das Ergebnis zurück. */
async function playMatch(matchId, token) {
  const path = `/api/matches/${matchId}`;
  let state = null;
  for (;;) {
    // Stand holen. Der Aufruf wartet, bis wir am Zug sind oder das Match vorbei ist.
    while (!state) state = await call("GET", `${path}/state?wait=${WAIT}`, { token });
    if (state.match.status === "finished" || state.match.status === "aborted") break;
    if (state.match.status !== "running" || state.submitted) {
      state = null;
      continue;
    }

    let actions = [];
    try {
      actions = decide(state) ?? [];
    } catch (error) {
      // Ein Fehler in der Strategie kostet nur diese Runde.
      console.error(`  Runde ${state.round}: Fehler in der Strategie (${error.message}), keine Aktionen`);
    }
    try {
      const answer = await call("POST", `${path}/orders?wait=${WAIT}`, { token, body: { round: state.round, actions } });
      answer.results.forEach((result, index) => {
        if (!result.ok) console.error(`  Runde ${state.round}: Aktion ${index} abgelehnt (${result.code})`);
      });
      if (state.round % 10 === 0) {
        const mine = state.planets.filter((planet) => planet.owner === state.you);
        console.log(`  Runde ${state.round}: ${mine.length} Planeten, Punkte ${state.score[state.you]}:${state.score[1 - state.you]}`);
      }
      // Mit ?wait= kommt der nächste Stand gleich mit. Sonst oben neu holen.
      state = answer.state;
    } catch (error) {
      // Zu spät oder doppelt eingereicht: einfach den aktuellen Stand holen und weiterspielen.
      if (!["stale_round", "already_submitted", "too_late"].includes(error.code)) throw error;
      state = null;
    }
  }
  const { result } = state.match;
  const verdict = result.winner === null ? "unentschieden" : result.winner === state.you ? "gewonnen" : "verloren";
  console.log(`Match ${matchId} beendet nach Runde ${state.match.round}: ${verdict} (${result.reason})`);
  return result;
}

async function playSeries(seriesId) {
  const path = `/api/series/${seriesId}`;
  const { slot, token } = await call("POST", `${path}/join`, { body: { name: NAME } });
  console.log(`Serie ${seriesId}: beigetreten als Teilnehmer ${slot + 1}`);
  let last = "";
  for (;;) {
    // Wartet, bis ein neues Match läuft oder die Serie vorbei ist.
    const me = await call("GET", `${path}/me?wait=${WAIT}&after=${last}`, { token });
    if (!me) continue;
    if (me.series.status === "finished" || me.series.status === "aborted") {
      const [mine, theirs] = slot === 0 ? me.series.wins : [me.series.wins[1], me.series.wins[0]];
      console.log(`Serie beendet: ${mine}:${theirs} aus meiner Sicht (${me.series.status})`);
      return;
    }
    if (!me.current) continue;
    console.log(`Spiel in Match ${me.current.matchId}, Sitz ${me.current.seat}`);
    await playMatch(me.current.matchId, token);
    last = me.current.matchId;
  }
}

async function main() {
  const health = await wake();
  console.log(`Regelstand: ${health.rules}`);
  if (args.series) return playSeries(args.series);

  let matchId = args.match;
  if (!matchId) {
    const opponent = args.vs || "standard";
    const preset = health.presets[args.takt === "turnier" ? "turnier" : "test"];
    const created = await call("POST", "/api/matches", {
      key: args.key || process.env.ARENA_KEY,
      body: { players: [{ type: "open" }, { type: "bot", bot: opponent }], options: preset },
    });
    matchId = created.match.id;
    console.log(`Match ${matchId} gegen "${opponent}" angelegt. Zuschauen: ${BASE}/m/${matchId}`);
  }
  const { seat, token } = await call("POST", `/api/matches/${matchId}/join`, { body: { name: NAME } });
  console.log(`Match ${matchId}: beigetreten auf Sitz ${seat}`);
  await playMatch(matchId, token);
}

main().catch((error) => {
  console.error(`Abbruch: ${error.message}`);
  process.exit(1);
});
