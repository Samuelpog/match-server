import type { Metadata } from "next";

export const metadata: Metadata = { title: "Schnittstelle" };

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/matches",
    auth: "Schlüssel, falls gesetzt",
    text: "Legt ein Match an. Body: { \"game\"?: string }. Antwort: Stand und Links.",
  },
  {
    method: "POST",
    path: "/api/matches/{id}/join",
    auth: "keine",
    text: "Besetzt den nächsten freien Sitzplatz. Body: { \"name\"?: string }. Antwort: Sitzplatz und Token, das Token nur dieses eine Mal.",
  },
  {
    method: "GET",
    path: "/api/matches/{id}",
    auth: "keine",
    text: "Öffentlicher Stand für Zuschauer. Zeigt nur, was das Spiel freigibt.",
  },
  {
    method: "GET",
    path: "/api/matches/{id}/me",
    auth: "Spieler-Token",
    text: "Stand aus Sicht des Spielers, mit you.seat und you.yourTurn.",
  },
  {
    method: "POST",
    path: "/api/matches/{id}/moves",
    auth: "Spieler-Token",
    text: "Sendet einen Zug. Body: { \"move\": JSON, \"moveId\"?: string }. Dieselbe moveId zweimal zieht nur einmal.",
  },
  {
    method: "GET",
    path: "/api/health",
    auth: "keine",
    text: "Zeigt, ob der Server läuft, welcher Speicher angebunden ist und welche Spiele es gibt.",
  },
];

const ERRORS = [
  ["400", "bad_request, unknown_game", "Die Anfrage ist fehlerhaft."],
  ["401", "unauthorized, create_key_required", "Token oder Schlüssel fehlt oder ist falsch."],
  ["404", "match_not_found", "Das Match gibt es nicht oder es ist abgelaufen."],
  ["409", "match_full, match_not_running, not_your_turn, write_conflict", "Die Anfrage passt nicht zum aktuellen Stand."],
  ["422", "invalid_move", "Das Spiel lehnt den Zug ab."],
];

export default function Page() {
  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Schnittstelle</h1>
        <p className="text-muted">
          Alles läuft über REST mit JSON. Spieler weisen sich mit dem Header{" "}
          <code className="font-mono text-ink">Authorization: Bearer TOKEN</code> aus.
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
          Auf Änderungen warten
        </h2>
        <p>
          Jeder Stand trägt eine <code className="font-mono">version</code>, die bei jeder Änderung um eins steigt.
          Beide GET-Endpunkte für ein Match nehmen <code className="font-mono">?since=VERSION&amp;wait=SEKUNDEN</code>{" "}
          an. Der Server hält die Anfrage dann bis zu 25 Sekunden offen und antwortet, sobald sich etwas ändert. Ohne
          Änderung kommt Status 204 ohne Inhalt.
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
