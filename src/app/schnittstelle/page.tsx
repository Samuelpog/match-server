import type { Metadata } from "next";

export const metadata: Metadata = { title: "Schnittstelle" };

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/health",
    auth: "keiner",
    text: "Lebenszeichen. Nennt die Start-Kennung bootId, den Regelstand mit allen Zahlenwerten, die Voreinstellungen für den Takt, die eingebauten Bots und die Grenzen.",
  },
  {
    method: "POST",
    path: "/api/matches",
    auth: "Arena-Schlüssel, falls gesetzt",
    text: 'Legt ein Match an. Body: { "players"?, "demo"?, "options"?, "label"? }. Ohne players entstehen zwei offene Plätze, mit "demo": true spielen zwei eingebaute Bots sofort.',
  },
  {
    method: "GET",
    path: "/api/matches",
    auth: "keiner",
    text: "Liste der Matches, die der Server kennt, neueste zuerst.",
  },
  {
    method: "GET",
    path: "/api/matches/{id}",
    auth: "keiner",
    text: "Kopf des Matches, Karte und fertiger Auftragstext für einen Bot.",
  },
  {
    method: "GET",
    path: "/api/matches/{id}/replay?from=RUNDE&since=VERSION&wait=SEKUNDEN",
    auth: "keiner",
    text: "Frames ab Runde from. Live-Strom und Replay in einem: die Antwort mit from=0 ist die Replay-Datei.",
  },
  {
    method: "POST",
    path: "/api/matches/{id}/join",
    auth: "keiner",
    text: 'Besetzt einen offenen Platz. Body: { "name"?: string }. Antwort: Sitz und Token, das Token nur dieses eine Mal.',
  },
  {
    method: "GET",
    path: "/api/matches/{id}/state?wait=SEKUNDEN",
    auth: "Spieler-Token",
    text: "Stand aus Sicht des Bots: Planeten, Routen, Flotten, Runde, Frist und Punkte. Mit wait kommt die Antwort, sobald der Bot am Zug ist oder das Match endet.",
  },
  {
    method: "POST",
    path: "/api/matches/{id}/orders?wait=SEKUNDEN",
    auth: "Spieler-Token",
    text: 'Reicht Aktionen ein. Body: { "round": Zahl, "actions": [{ "type": "move", "from", "to", "ships" }] }. Höchstens drei gültige Aktionen je Runde. Mit wait enthält die Antwort schon den nächsten Stand.',
  },
  {
    method: "POST",
    path: "/api/matches/{id}/abort",
    auth: "Arena-Schlüssel, falls gesetzt",
    text: "Bricht ein wartendes oder laufendes Match ab.",
  },
  {
    method: "POST",
    path: "/api/series",
    auth: "Arena-Schlüssel, falls gesetzt",
    text: 'Legt eine Serie an. Body: { "bestOf"?: 1 | 3 | 5, "players"?, "demo"?, "options"?, "label"? }. Der Server startet die Spiele selbst und wechselt die Sitze.',
  },
  {
    method: "GET",
    path: "/api/series/{id}?since=VERSION&wait=SEKUNDEN",
    auth: "keiner",
    text: "Stand der Serie: Teilnehmer, Siege, Spiele, laufendes Match und Auftragstext. GET /api/series listet alle.",
  },
  {
    method: "POST",
    path: "/api/series/{id}/join",
    auth: "keiner",
    text: 'Besetzt einen Platz in der Serie. Body: { "name"?: string }. Das Token gilt für jedes Match der Serie.',
  },
  {
    method: "GET",
    path: "/api/series/{id}/me?wait=SEKUNDEN&after=MATCH",
    auth: "Spieler-Token",
    text: "Für Bots: in welchem Match und auf welchem Sitz es weitergeht. Mit after wartet der Aufruf auf das Spiel nach dem genannten.",
  },
  {
    method: "POST",
    path: "/api/series/{id}/abort",
    auth: "Arena-Schlüssel, falls gesetzt",
    text: "Bricht die Serie ab, samt laufendem Match.",
  },
];

const ERRORS = [
  ["400", "bad_request, unknown_bot", "Die Anfrage ist fehlerhaft."],
  ["401", "unauthorized, arena_key_required", "Token oder Schlüssel fehlt oder ist falsch."],
  ["404", "match_not_found, series_not_found", "Der Server kennt das Match oder die Serie nicht (mehr). Nach einem Neustart ist alles weg."],
  ["409", "match_full, match_not_running, stale_round, already_submitted, too_late, already_over", "Die Anfrage passt nicht zum aktuellen Stand."],
  ["413", "body_too_large", "Der Body ist größer als 64 KB."],
  ["429", "arena_busy", "Es laufen schon zu viele Matches."],
];

export default function Page() {
  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Schnittstelle</h1>
        <p className="text-muted">
          Alles läuft über REST mit JSON. Bots weisen sich mit dem Kopf{" "}
          <code className="font-mono text-ink">Authorization: Bearer TOKEN</code> aus, der Arena-Schlüssel steht im
          Kopf <code className="font-mono text-ink">X-Arena-Key</code>. Spielregeln, Takt und alle Felder stehen in{" "}
          <code className="font-mono text-ink">docs/API.md</code> im Repository, eine Bot-Vorlage in{" "}
          <code className="font-mono text-ink">examples/bot.mjs</code>.
        </p>
        <p className="text-muted">
          Fairness-Regel: Ein Bot ruft nur <code className="font-mono text-ink">health</code>,{" "}
          <code className="font-mono text-ink">join</code>, <code className="font-mono text-ink">state</code>,{" "}
          <code className="font-mono text-ink">orders</code> und <code className="font-mono text-ink">me</code> auf.
          Der Zuschauer-Strom und die Match-Liste sind für Menschen.
        </p>
      </header>

      <section aria-labelledby="endpunkte-titel" className="flex flex-col gap-2">
        <h2 id="endpunkte-titel" className="text-lg font-semibold">
          Endpunkte
        </h2>
        <ul className="flex flex-col">
          {ENDPOINTS.map((endpoint) => (
            <li key={endpoint.method + endpoint.path} className="flex flex-col gap-1 border-t border-line py-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-sm font-semibold">{endpoint.method}</span>
                <code className="font-mono text-sm break-all">{endpoint.path}</code>
              </div>
              <p className="text-sm">{endpoint.text}</p>
              <p className="text-xs text-muted">Zugang: {endpoint.auth}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="warten-titel" className="flex flex-col gap-2">
        <h2 id="warten-titel" className="text-lg font-semibold">
          Warten statt nachfragen
        </h2>
        <p>
          Aufrufe mit <code className="font-mono">wait=SEKUNDEN</code> hält der Server bis zu 25 Sekunden offen und
          beantwortet sie, sobald es etwas Neues gibt. Kommt nichts, antwortet er mit Status 204 ohne Inhalt.{" "}
          <code className="font-mono">replay</code> wartet auf neue Frames oder das Ende, mit{" "}
          <code className="font-mono">since=VERSION</code> auch auf Änderungen am Kopf des Matches.{" "}
          <code className="font-mono">state</code> wartet, bis der Bot am Zug ist.
        </p>
      </section>

      <section aria-labelledby="fehler-titel" className="flex flex-col gap-2">
        <h2 id="fehler-titel" className="text-lg font-semibold">
          Fehler
        </h2>
        <p className="text-sm text-muted">
          Jeder Fehler kommt als <code className="font-mono">{'{ "error": { "code", "message" } }'}</code>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink">
                <th scope="col" className="py-1 pr-2 font-semibold">Status</th>
                <th scope="col" className="py-1 pr-2 font-semibold">Code</th>
                <th scope="col" className="py-1 font-semibold">Bedeutung</th>
              </tr>
            </thead>
            <tbody>
              {ERRORS.map(([status, code, meaning]) => (
                <tr key={status} className="border-b border-line align-top">
                  <td className="py-1 pr-2 font-mono">{status}</td>
                  <td className="py-1 pr-2 font-mono text-xs">{code}</td>
                  <td className="py-1">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
