#!/usr/bin/env node
/**
 * Beispiel-Bot für die Planet Wars Arena. Ohne Abhängigkeiten, Node 22 oder neuer.
 *
 * Einem Match beitreten:      node examples/bot.mjs --match <id> --name Alpha
 * Einer Serie beitreten:      node examples/bot.mjs --series <id> --name Alpha
 * Gegen einen eingebauten Bot: node examples/bot.mjs --vs expansion --name Alpha
 *
 * Weitere Schalter: --url <Adresse des Servers>, --key <Arena-Schlüssel> (nur für --vs).
 * Standard-Adresse ist die Umgebungsvariable ARENA_URL, sonst http://localhost:3000.
 *
 * Hinter einem HTTPS-Proxy (Cloud-Umgebung) mit NODE_USE_ENV_PROXY=1 starten,
 * sonst beachtet Node die Variable HTTPS_PROXY nicht.
 *
 * Die Strategie steht in `decide()` und ist absichtlich schlicht. Alles
 * andere ist das Protokoll und kann so bleiben.
 */

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg, index, all) => (arg.startsWith("--") ? [[arg.slice(2), all[index + 1] ?? ""]] : [])),
);
const BASE = (args.url || process.env.ARENA_URL || "http://localhost:3000").replace(/\/+$/, "");
const NAME = args.name || "Beispiel-Bot";
const WAIT = 25;

// ---------------------------------------------------------------- Strategie

/**
 * Bekommt den Stand (`PlayerState` aus docs/API.md) und gibt Befehle zurück.
 * Hier: jeder eigene Planet greift den nächstgelegenen fremden Planeten an,
 * den er sicher erobern kann. Wer kein Ziel findet, schickt die Hälfte seiner
 * Schiffe an den eigenen Planeten, der dem Gegner am nächsten liegt.
 */
function decide(state) {
  const me = state.you;
  const ticks = (a, b) => Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / state.speed));
  const onTheWay = new Map();
  for (const fleet of state.fleets) {
    if (fleet.owner === me) onTheWay.set(fleet.to, (onTheWay.get(fleet.to) ?? 0) + fleet.ships);
  }

  const mine = state.planets.filter((planet) => planet.owner === me);
  const enemies = state.planets.filter((planet) => planet.owner !== me && planet.owner !== null);
  const reach = (planet) => Math.min(...enemies.map((enemy) => ticks(planet, enemy)));
  const front = enemies.length > 0 ? mine.reduce((best, planet) => (reach(planet) < reach(best) ? planet : best), mine[0]) : null;

  const orders = [];
  for (const source of mine) {
    let best = null;
    for (const target of state.planets) {
      if (target.owner === me) continue;
      const eta = ticks(source, target);
      const defence = target.ships + (target.owner === null ? 0 : target.growth * eta);
      const need = defence + 1 - (onTheWay.get(target.id) ?? 0);
      if (need <= 0 || need > source.ships - 5) continue;
      if (!best || eta < best.eta) best = { target, eta, need };
    }
    if (best) {
      orders.push({ from: source.id, to: best.target.id, ships: best.need });
      onTheWay.set(best.target.id, (onTheWay.get(best.target.id) ?? 0) + best.need);
    } else if (front && source.id !== front.id && source.ships >= 40) {
      orders.push({ from: source.id, to: front.id, ships: Math.floor(source.ships / 2) });
    }
  }
  return orders;
}

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

    const orders = decide(state);
    try {
      const answer = await call("POST", `${path}/orders?wait=${WAIT}`, { token, body: { tick: state.tick, orders } });
      for (const rejected of answer.rejected) console.error(`  Tick ${state.tick}: Befehl ${rejected.index} abgelehnt (${rejected.code})`);
      if (state.tick % 20 === 0) {
        const mine = state.planets.filter((planet) => planet.owner === state.you);
        console.log(`  Tick ${state.tick}: ${mine.length} Planeten, ${mine.reduce((sum, planet) => sum + planet.ships, 0)} Schiffe am Boden`);
      }
      // Mit ?wait= kommt der nächste Stand gleich mit. Sonst oben neu holen.
      state = answer.state;
    } catch (error) {
      // Zu spät oder doppelt eingereicht: einfach den aktuellen Stand holen und weiterspielen.
      if (error.code !== "stale_tick" && error.code !== "already_submitted") throw error;
      state = null;
    }
  }
  const { result } = state.match;
  const verdict = result.winner === null ? "unentschieden" : result.winner === state.you ? "gewonnen" : "verloren";
  console.log(`Match ${matchId} beendet nach Tick ${state.match.tick}: ${verdict} (${result.reason})`);
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
  await wake();
  if (args.series) return playSeries(args.series);

  let matchId = args.match;
  if (!matchId) {
    const opponent = args.vs || "expansion";
    const created = await call("POST", "/api/matches", {
      key: args.key || process.env.ARENA_KEY,
      body: { players: [{ type: "open" }, { type: "bot", bot: opponent }] },
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
