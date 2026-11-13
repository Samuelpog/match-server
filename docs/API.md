# Planet Wars Arena: Regeln und Schnittstelle

Verbindliche Beschreibung für Bots und Zuschauer-Ansicht. Die Typen dazu stehen in `src/lib/game/types.ts` (Spiel) und `src/lib/arena/api-types-v2.ts` (HTTP). Weicht dieser Text von den Typen ab, gelten die Typen. Die Herleitung der Regeln steht in `coordination/decisions/a-0004-regeln-v2.md`.

Stand: 2026-11-13, Regelstand `rundenstrategie/1.0` (Stufe 1). Alles hier Beschriebene ist gebaut. Ausbauten, Nachschublinien, Schiffstypen und Nebel kommen in späteren Stufen. Sie fügen nur Felder und Aktionsarten hinzu.

## Fairness-Regel

Ein Bot ruft nur `health`, `join`, `state`, `orders` und `me` auf. Der Zuschauer-Strom (`replay`), der Kopf eines Matches und die Match-Liste sind für Menschen. Die Regel gilt ab sofort, auch wenn bis Stufe 4 ohnehin alles sichtbar ist.

## 1. Spielregeln

### Karte

- 15 oder 17 Planeten, Standard 15. Jeder hat `id`, `name`, `x`, `y`, `growth` (neue Schiffe je Runde), `home`, `hub` und `twin`.
- Das Feld ist 200 mal 140 Einheiten groß. Die Karte ist punktsymmetrisch um ihre Mitte: Jeder Planet außer dem Mittelplaneten hat einen Zwilling (`twin`) mit gleichem Wachstum und gleicher Besatzung, zu jeder Route gibt es die gespiegelte.
- Planeten sind über **Routen** verbunden: `[a, b, Runden]` mit `a < b`. Eine Flotte fliegt nur über eine Route. Die Länge ist 1 bis 3 Runden. Jeder Planet hat 2 bis 4 Routen, Routen kreuzen sich nicht.
- Sitz 0 und Sitz 1 starten auf gespiegelten **Heimatplaneten** (`home`) mit je 30 Schiffen und Wachstum 4. Der kürzeste Weg zwischen ihnen hat mindestens 4 Routen und 6 Runden. Alle anderen Planeten sind neutral und produzieren nicht.
- Drei **Knotenplaneten** (`hub`): der Mittelplanet und ein Paar an den Flanken. Jeder ist von beiden Heimatplaneten gleich viele Runden entfernt. Ab Stufe 2 lässt sich nur dort eine Kommandozentrale bauen.
- Gleicher `seed` und gleiche Planetenzahl ergeben immer dieselbe Karte. Die ganze Karte ist öffentlich.

### Eine Runde

Beide Spieler sehen denselben Stand und reichen verdeckt Aktionen für Runde `r` ein. Aufgelöst wird in dieser Reihenfolge:

| Schritt | Kennung | Was geschieht |
|---|---|---|
| 1 | `actions` | Aktionen werden in der eingereichten Reihenfolge geprüft und ausgeführt. Flotten starten. |
| 2 | `move` | Jede Flotte, die nicht in dieser Runde gestartet ist, rückt eine Runde vor. |
| 3 | `route` | Kampf auf der Route. |
| 4 | `arrival` | Flotten am Ende ihrer Route kommen an: Verstärkung oder Kampf am Planeten. |
| 5 | `production` | Jeder Planet eines Spielers bekommt sein Wachstum dazu. |
| 6 | `build` | Fertige Ausbauten werden wirksam (ab Stufe 2). |
| 7 | `end` | Punkte werden berechnet, der Sieg wird geprüft. |

Eine Flotte, die in Runde `r` über eine Route der Länge `L` startet, kommt in Runde `r + L` an. Der Gegner sieht sie also mindestens eine Runde vorher. Ein Planet, der in Schritt 4 erobert wird, produziert in Schritt 5 schon für den neuen Besitzer.

### Aktionen

- Ein Spieler hat **3 Aktionen je Runde** (`state.actions.limit`).
- In Stufe 1 gibt es eine Aktionsart: `{ "type": "move", "from": <Planet>, "to": <Planet>, "ships": <Anzahl> }`.
  - `from` gehört dem Spieler, `to` ist ein Nachbar über eine Route.
  - `ships` ist eine ganze Zahl ab 1 und höchstens die Besatzung, die nach den früheren Aktionen derselben Liste noch auf `from` steht.
  - Zwei Züge über dieselbe Route in derselben Runde bilden eine Flotte, kosten aber zwei Aktionen.
- Gültige Aktionen zählen. Ungültige werden einzeln mit einem Grund abgelehnt und zählen nicht. Ist das Limit erreicht, wird der Rest mit `action_limit` abgelehnt.
- Je Einreichung prüft der Server höchstens 20 Aktionen.

| Grund | Bedeutung |
|---|---|
| `bad_action` | Keine Aktion in der verlangten Form. |
| `bad_planet` | `from` oder `to` ist kein Planet dieser Karte. |
| `not_owner` | Der Startplanet gehört dir nicht. |
| `no_route` | Zwischen den Planeten gibt es keine Route. |
| `bad_ships` | `ships` ist keine ganze Zahl ab 1. |
| `not_enough_ships` | Auf dem Startplaneten stehen nicht genug Schiffe. |
| `not_available` | Diese Aktionsart gibt es im aktuellen Regelstand noch nicht. |
| `action_limit` | Das Limit dieser Runde ist erreicht. |

### Kampf auf der Route

- Zwei Flotten verschiedener Spieler kämpfen, wenn sie auf derselben Route in entgegengesetzter Richtung fliegen und sich in dieser Runde treffen oder aneinander vorbeikämen.
- Die größere Flotte überlebt mit der Differenz und fliegt weiter. Bei Gleichstand sind beide vernichtet.
- Treffen mehrere Flotten aufeinander, kämpfen zuerst die vordersten beider Richtungen. Der Sieger trifft danach auf die nächste.
- Flotten in gleicher Richtung kämpfen nie. Eigene Flotten fliegen aneinander vorbei.
- Wer einer ankommenden Flotte aus dem Planeten entgegenfliegt, kämpft direkt vor dem Planeten, ohne Heimatschutz.

### Kampf am Planeten

1. Flotten des Besitzers verstärken die Besatzung.
2. Fremde Flotten werden je Spieler zusammengezählt.
3. Die Verteidigung zählt mit ihrer Stärke: Besatzung, am Heimatplaneten plus Heimatschutz.
4. Die stärkste Partei gewinnt und behält die Differenz zur zweitstärksten. Sind die beiden stärksten gleich, behält der Besitzer den Planeten mit 0 Schiffen.
5. Gewinnt der Verteidiger am Heimatplaneten, fängt zuerst der Heimatschutz Angreifer ab, der Rest trifft die Besatzung.

**Heimatschutz:** Am Heimatplaneten kämpfen 15 zusätzliche Verteidiger mit, solange er seinem ersten Besitzer gehört. Sie können nicht ziehen und sind in jeder Runde wieder voll da. Ein Angreifer braucht also mehr als Besatzung plus 15.

### Sieg und Punkte

- **Punkte:** Summe des Wachstums der eigenen Planeten. Sie stehen in jedem Stand (`score`).
- **Sofortsieg:** Wer den Heimatplaneten des Gegners erobert, gewinnt in dieser Runde (`reason: "home"`). Fallen beide Heimatplaneten in derselben Runde, entscheiden die Punkte.
- **Nach der letzten Runde** (Standard 120): Mehr Punkte gewinnen (`points`). Bei Gleichstand gewinnt, wer mehr Schiffe hat, Besatzungen und Flotten zusammen (`ships`). Ist auch das gleich, ist es unentschieden (`draw`).

### Zahlenwerte

Alle Zahlen stehen in `params` (im Stand des Bots, im Match-Kopf, im Replay und in `GET /api/health`). Bots und Ansicht lesen sie von dort. Ändert sich eine Regel oder ein Wert, zählt die Kennung in `rules` hoch.

| Wert | Stufe 1 |
|---|---|
| `actions` | `base` 3, `max` 5 |
| `home` | `ships` 30, `growth` 4, `guard` 15 |
| `unitsPerRound` | 25 |
| `buildings` | leer |
| `actionTypes` | `["move"]` |

## 2. Takt und Fristen

| Option | Bedeutung | Bereich | Standard |
|---|---|---|---|
| `rounds` | Zahl der Runden | 20 bis 200 | 120 |
| `roundMs` | Mindestdauer einer Runde | 100 bis 10000 | 8000 |
| `timeoutMs` | Frist für Aktionen ab Rundenbeginn | 500 bis 30000 | 5000 |

- Zwei Voreinstellungen in `health.presets`: **`turnier`** mit 8000 und 5000, **`test`** mit 100 und 2000. Ohne Angabe gilt der Turniertakt, ein Match dauert dann bis zu 16 Minuten. Zum Entwickeln den Testtakt angeben.
- Eine Runde wird aufgelöst, sobald beides gilt: Alle anwesenden Bots haben eingereicht oder die Frist ist vorbei, und `roundMs` ist vorbei.
- Nach der Frist nimmt der Server für die Runde nichts mehr an (`too_late`). Wer nichts einreicht, tut in der Runde nichts.
- Die erste Runde hat mindestens 5 Sekunden Frist.
- Verpasst ein Bot 5 Fristen in Folge, gilt er als abwesend. Auf ihn wird nicht mehr gewartet, bis er wieder einreicht.
- Eingebaute Bots rechnen im Server auf demselben Stand und halten nie auf.

## 3. HTTP-Grundlagen

- Basis: `https://match-server-81dg.onrender.com`. Alles ist JSON, alle Antworten tragen `Cache-Control: no-store`.
- Fehler: `{ "error": { "code": "…", "message": "…" } }` mit passendem Status.
- **Warten:** Endpunkte mit `wait=<Sekunden>` halten die Verbindung, bis es etwas Neues gibt, höchstens 25 Sekunden. Gibt es nichts Neues, kommt `204` ohne Body.
- **Spieler-Token:** `Authorization: Bearer <token>`.
- **Arena-Schlüssel:** Ist beim Server `ARENA_KEY` gesetzt, brauchen Anlegen und Abbrechen den Kopf `X-Arena-Key: <schlüssel>`. `GET /api/health` meldet das in `arenaKeyRequired`. Lesen und Beitreten gehen immer ohne.
- **Schlafmodus:** Der Server schläft nach 15 Minuten ohne Anfrage ein und vergisst dabei alles. Der erste Aufruf danach hängt, bis der Prozess gestartet ist, und endet dann normal: gemessen 23 Sekunden, bis zu einer Minute ist möglich. Vor dem Anlegen `GET /api/health` aufrufen und bei Zeitüberschreitung wiederholen. `bootId` ändert sich bei jedem Neustart.

## 4. Endpunkte

### Allgemein

| Aufruf | Zweck |
|---|---|
| `GET /api/health` | Lebenszeichen, `bootId`, `rules`, `params`, `presets`, eingebaute Bots, Standardwerte und Grenzen. Typ `HealthResponse`. |

### Matches

| Aufruf | Zweck |
|---|---|
| `POST /api/matches` | Match anlegen. Body `CreateMatchRequest`, Antwort `201` mit `MatchResponse`. |
| `GET /api/matches?limit=50` | Liste, neueste zuerst. `MatchListResponse`. |
| `GET /api/matches/{id}` | Kopf, Karte und Auftragstext. `MatchResponse`. |
| `GET /api/matches/{id}/replay?from=0&since=<version>&wait=25` | Frames ab Runde `from`. `ReplayResponse`. Live-Strom und Replay in einem. |
| `POST /api/matches/{id}/abort` | Match abbrechen. |

`POST /api/matches` ohne `players` legt zwei offene Plätze an. Das Match startet, sobald beide Sitze besetzt sind. Mit `"demo": true` spielen zwei eingebaute Bots sofort gegeneinander. `options` kennt `seed`, `planets`, `rounds`, `roundMs` und `timeoutMs`. Die alten Namen `tickLimit` und `tickMs` weist der Server zurück.

`replay` wartet, solange es keinen Frame ab `from` gibt und das Match nicht beendet ist. Mit `since=<match.version>` kehrt der Aufruf auch zurück, wenn sich nur der Kopf geändert hat (Beitritt, Start, `online`, `absent`, Ende), dann mit leerem `frames`. Die Antwort mit `from=0` ist die Replay-Datei.

Die Karte steht mit dem Anlegen fest, Frame 0 ist sofort abrufbar, auch solange das Match noch auf Bots wartet.

Ein Match, das der Server nicht (mehr) kennt, beantwortet er mit `404` und Code `match_not_found`. Hat sich zugleich `bootId` in `GET /api/health` geändert, wurde der Server neu gestartet.

### Für Bots

| Aufruf | Zweck |
|---|---|
| `POST /api/matches/{id}/join` | Offenen Platz besetzen. Body `{ "name": "…" }`, Antwort `JoinResponse` mit `token`. |
| `GET /api/matches/{id}/state?wait=25` | Stand aus Sicht des Bots. `PlayerState`. Mit `wait` kommt die Antwort, sobald der Bot am Zug ist oder das Match vorbei ist. |
| `POST /api/matches/{id}/orders?wait=25` | Aktionen einreichen. Body `{ "round": <state.round>, "actions": [...] }`, Antwort `OrdersResponse`. Mit `wait` kommt der nächste Stand gleich mit: ein Aufruf je Runde genügt. |

Der Stand (`PlayerState`), gekürzt:

```json
{
  "rules": "rundenstrategie/1.0",
  "params": { "actions": { "base": 3, "max": 5 }, "home": { "ships": 30, "growth": 4, "guard": 15 } },
  "you": 0,
  "round": 47,
  "rounds": 120,
  "deadlineMs": 4180,
  "submitted": false,
  "actions": { "limit": 3 },
  "score": [14, 11],
  "planets": [
    { "id": 0, "name": "Vega", "x": 30, "y": 100, "growth": 4, "home": 0, "hub": false, "twin": 1,
      "owner": 0, "ships": 42, "building": null, "supply": null }
  ],
  "routes": [[0, 5, 2]],
  "fleets": [
    { "id": 88, "owner": 1, "from": 7, "to": 5, "ships": 20, "progress": 1, "length": 2, "arrive": 48, "supply": false }
  ],
  "match": { "id": "…", "status": "running" }
}
```

- `round` ist die Runde, für die jetzt Aktionen gefragt sind.
- `owner` ist `0`, `1` oder `null` für neutral. Was `owner === you` hat, gehört dir.
- `planets[i].id === i`. `routes` ist die ganze Karte.
- Eine Flotte kommt in Runde `arrive` an. `progress` zählt die geflogenen Runden.

Ablauf eines Bots:

1. `join`, Token merken.
2. `state?wait=25` holen. Bei `204` wiederholen: das Match wartet noch auf den Gegner.
3. Aktionen für `state.round` berechnen und mit `orders?wait=25` einreichen.
4. Die Antwort enthält `results` (je Aktion angenommen oder abgelehnt mit Grund) und `state` für die nächste Runde. Weiter bei 3, bis `state.match.status` nicht mehr `running` ist.
5. Ist `state` in der Antwort `null` oder gab es einen Netzfehler: weiter bei 2.

| Fehler bei `orders` | Bedeutung | Was tun |
|---|---|---|
| `409 stale_round` | Die Aktionen gelten für eine andere Runde. Die Antwort nennt die aktuelle. | weiter bei 2 |
| `409 already_submitted` | Für diese Runde hast du schon eingereicht. | weiter bei 2 |
| `409 too_late` | Die Frist der Runde ist vorbei. | weiter bei 2 |
| `409 match_not_running` | Das Match wartet noch oder ist vorbei. | weiter bei 2 |

Die Vorlage `examples/bot.mjs` setzt genau diesen Ablauf um. Die Strategie steht getrennt in `examples/strategy.mjs`.

**Hinter einem HTTPS-Proxy** (etwa in einer Cloud-Umgebung) beachtet Nodes `fetch` die Variable `HTTPS_PROXY` nur mit `NODE_USE_ENV_PROXY=1`. Ohne sie scheitert jeder Aufruf mit `fetch failed`. Start also: `NODE_USE_ENV_PROXY=1 node examples/bot.mjs …`. Der Hostname des Servers muss in der Umgebung freigegeben sein.

### Serien

Eine Serie spielt Best-of-1, 3 oder 5 zwischen denselben zwei Teilnehmern. Ein Bot tritt der Serie einmal bei, sein Token gilt für alle Matches darin. Im Turniertakt dauert eine Serie über drei Spiele bis zu 50 Minuten.

- Die Serie startet, sobald beide Plätze besetzt sind. Das nächste Spiel beginnt 4 Sekunden nach dem Ende des vorigen.
- Die Sitze wechseln von Spiel zu Spiel: Teilnehmer 0 sitzt in Spiel 1 auf Sitz 0, in Spiel 2 auf Sitz 1.
- Jedes Spiel hat eine eigene Karte: `seed + Spielnummer - 1`.
- Die Serie endet, sobald ein Teilnehmer mehr als die Hälfte der Spiele gewonnen hat, spätestens nach `bestOf` Spielen. Ein Unentschieden zählt als gespieltes Spiel ohne Sieger. Bei gleich vielen Siegen am Ende hat die Serie keinen Gewinner.
- Wird ein Spiel der Serie abgebrochen, endet die Serie mit Status `aborted`.

| Aufruf | Zweck |
|---|---|
| `POST /api/series` | Serie anlegen. Body `CreateSeriesRequest`, Antwort `201` mit `SeriesResponse`. |
| `GET /api/series?limit=50` | Liste, neueste zuerst. `SeriesListResponse`. |
| `GET /api/series/{id}?since=<version>&wait=25` | Stand, Spiele, laufendes Match, Auftragstext. `SeriesResponse`. Mit `since` und `wait` hält der Aufruf, bis sich `series.version` ändert. |
| `POST /api/series/{id}/join` | Platz in der Serie besetzen. Body `{ "name": "…" }`, Antwort `SeriesJoinResponse` mit `token`. |
| `GET /api/series/{id}/me?wait=25&after=<matchId>` | Für Bots: in welchem Match und auf welchem Sitz es weitergeht. `SeriesPlayerState`. |
| `POST /api/series/{id}/abort` | Serie abbrechen, samt laufendem Match. |

`me` mit `wait` antwortet, sobald ein Match der Serie läuft oder die Serie vorbei ist. `after=<matchId>` blendet ein schon gespieltes Match aus, damit der Bot nach einem Spiel auf das nächste wartet.

Ablauf eines Bots in einer Serie:

1. `join`, Token merken.
2. `me?wait=25&after=<letztes Match>` fragen, bei `204` wiederholen. Ist `series.status` `finished` oder `aborted`: fertig.
3. Das Match `current.matchId` wie oben spielen, mit demselben Token. `current.seat` ist der Sitz in diesem Spiel.
4. Weiter bei 2.

Für die Zuschauer-Seite: `series.current` ist die Kennung des laufenden Matches, `series.games` listet alle Spiele mit Ergebnis. `games[].winner` ist der Teilnehmer (`slot`), nicht der Sitz.

## 5. Frames lesen

Frame 0 ist der Start, Frame `r` der Stand nach Runde `r`. Die Replay-Datei trägt `version: 2`, `match.rules` und `match.params`.

- `planets[i]` ist `{ owner, ships, building, supply }`. `building` und `supply` sind bis Stufe 2 immer `null`.
- `fleets` sind **alle** Flotten, die nach der Runde unterwegs sind. Eine Flotte behält ihre `id`. Startet sie in Runde `r`, steht sie im Frame `r` mit `progress: 0`. Kommt sie an, steht sie nicht mehr in `fleets`, und ein Ereignis `arrival` nennt ihre `id`. Wird sie vernichtet, nennt sie ein Ereignis `route`.
- `actions[sitz]` sind die Aktionen der Runde in eingereichter Reihenfolge: `{ action, ok, code?, fleet? }`. `action` ist die Eingabe des Bots, unverändert. Bei `move` nennt `fleet` die Flotte, in der die Schiffe fliegen.
- `events` stehen in der Reihenfolge der Schritte: erst alle `route`, dann `arrival` aufsteigend nach Planet, dann `build`.
  - `route`: ein Zweikampf. `at` ist der Abstand von `route[0]` in Runden, in halben Schritten. Bei 0 oder bei der Länge der Route war es ein Ausfall direkt vor dem Planeten. `fleets` nennt je Flotte Stärke vorher und nachher.
  - `arrival`: `kind` ist `reinforce` oder `battle`. `before` ist die Besatzung vor allen Ankünften der Runde, `defense.strength` die Stärke der Verteidigung mit eigener Verstärkung und Heimatschutz, `after` der Stand nach dem Kampf und vor der Produktion.
- `players[sitz]` enthält `submitted`, `actions` (genutzt und Limit), `score`, `ships`, `planets`, `growth` und `production`.
- `visible` ist `null`: beide sehen alles. Ab Stufe 4 steht dort je Sitz, was er sieht.
- `at` sind die Millisekunden seit Match-Start.

Ein Beispiel liegt in `fixtures/replay-v2-stufe1.json`.

## 6. Lokal ohne Server

`src/lib/game/` ist reiner Code ohne Node-Abhängigkeiten und läuft auch im Browser. `simulate()` spielt ein ganzes Match zwischen zwei Bot-Funktionen und liefert dieselben Frames wie der Server.

Der Simulator für die Bot-Entwicklung:

```bash
npm run sim -- --a ./examples/strategy.mjs --b standard --karten 200
```

- `--a` und `--b`: Kennung eines eingebauten Bots (`standard`, `sturm`, `passiv`) oder eine Datei, deren Standard-Export eine Funktion ist: Stand hinein, Liste von Aktionen heraus. Der Stand hat die Form von `PlayerState` ohne `match`, `deadlineMs` und `submitted`.
- `--karten` (Standard 200), `--seed` (erster Seed, Standard 1), `--planeten` (15 oder 17), `--runden`.
- Jede Karte wird mit beiden Sitzverteilungen gespielt. Ausgegeben werden Siege, Art des Endes, Länge, Führungswechsel, abgelehnte Aktionen und die längste Rechenzeit eines Zugs.
- Braucht Node 22.18 oder neuer.

Dieselbe Strategie-Datei spielt gegen den Server: `node examples/bot.mjs --strategy ./examples/strategy.mjs --vs standard`.
