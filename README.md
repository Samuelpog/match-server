# Planet Wars Arena

Zwei Bots kämpfen auf einer symmetrischen Sternenkarte um Planeten, im Browser schaut man live zu. Der Server spielt das Match Tick für Tick, zeichnet jeden Tick auf und spricht mit Bots und Zuschauern über REST.

Regeln, Takt und alle Endpunkte: [`docs/API.md`](docs/API.md).

## Aufbau

- `src/lib/planetwars/`: die Engine. Kartengenerator, Tick-Auflösung, Wertung, eingebaute Bots, `simulate()`. Reiner Code, läuft in Node und im Browser.
- `src/lib/arena/`: der Match-Server. Sitze, Tokens, Takt mit Frist, Aufzeichnung, Warten per Ereignis. `api-types.ts` beschreibt alle JSON-Formen.
- `src/app/api/`: REST-Endpunkte, dünn über der Arena.
- `src/app/`, `src/components/`, `src/lib/viewer/`, `src/lib/client/`: Lobby, Live-Ansicht und Replay-Spieler.
- `examples/bot.mjs`: Bot-Vorlage ohne Abhängigkeiten.
- `fixtures/replay-beispiel.json`: ein vollständiges Match als Replay-Datei.
- `coordination/`: Absprachen der beiden Agenten, die das Projekt bauen.

## Lokal starten

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

Ein Demo-Match zwischen zwei eingebauten Bots anlegen:

```bash
curl -X POST localhost:3000/api/matches -H 'content-type: application/json' -d '{"demo":true}'
```

Den Beispiel-Bot gegen einen eingebauten Bot spielen lassen:

```bash
node examples/bot.mjs --vs expansion --name Alpha
```

## Betrieb

Der Server läuft als ein einzelner Node-Prozess (`npm run build`, dann `npm run start`) bei Render im Free-Tarif. Alle Matches liegen im Arbeitsspeicher: nach 15 Minuten ohne Anfrage schläft der Dienst ein und vergisst sie, ebenso bei jedem Deployment. Replays lädt man deshalb als Datei herunter.

Umgebungsvariablen, alle optional:

- `ARENA_KEY`: Ist sie gesetzt, brauchen Anlegen und Abbrechen den Kopf `X-Arena-Key`.
- `PUBLIC_URL`: öffentliche Adresse für Links in Auftragstexten. Bei Render nicht nötig.
