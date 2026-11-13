# Planet Wars Arena: Regeln und Schnittstelle

Verbindliche Beschreibung für Bots und Zuschauer-UI. Die Typen dazu stehen in `src/lib/planetwars/types.ts` (Spiel) und `src/lib/arena/api-types.ts` (HTTP). Weicht dieser Text von den Typen ab, gelten die Typen.

Stand: Matches sind gebaut, Serien folgen. Abschnitte mit „geplant" gibt es noch nicht.

## 1. Spielregeln

### Karte

- 20 bis 30 Planeten, Standard 24. Jeder hat `id`, `x`, `y` und `growth` (Produktionsrate, 1 bis 5).
- Das Feld ist 200 mal 140 Einheiten groß, Koordinaten sind ganze Zahlen. `speed` ist 10 Einheiten je Tick, Flugzeiten liegen damit zwischen 2 und etwa 24 Ticks.
- Die Karte ist punktsymmetrisch um ihre Mitte: zu jedem Planeten gibt es einen gespiegelten Zwilling mit gleicher Produktionsrate und gleicher Startgarnison. Bei ungerader Anzahl liegt ein Planet genau in der Mitte.
- Sitz 0 und Sitz 1 starten auf gespiegelten Heimatplaneten mit je 100 Schiffen und Produktionsrate 5. Alle anderen Planeten sind neutral.
- Gleicher `seed` und gleiche Planetenzahl ergeben immer dieselbe Karte.

### Ein Tick

Beide Spieler sehen den Stand von Tick `t` und reichen Befehle dazu ein. Aufgelöst wird in dieser Reihenfolge, das Ergebnis ist Tick `t + 1`:

1. **Start.** Die Befehle beider Spieler werden geprüft und ausgeführt. Jeder gültige Befehl zieht die Schiffe vom Startplaneten ab und erzeugt eine Flotte.
2. **Produktion.** Jeder Planet, der einem Spieler gehört, bekommt `growth` Schiffe dazu. Neutrale Planeten produzieren nichts.
3. **Ankunft.** Alle Flotten mit `arrive === t + 1` treffen ein. Je Planet wird einmal abgerechnet (siehe Kampf).
4. **Ende.** Siegbedingungen werden geprüft.

### Befehle

Ein Befehl ist `{ "from": <Planet>, "to": <Planet>, "ships": <Anzahl> }`.

- `from` muss dem Spieler gehören, `to` ist ein beliebiger anderer Planet.
- `ships` ist eine ganze Zahl ab 1 und höchstens die Garnison, die nach den vorherigen Befehlen derselben Liste noch auf `from` steht. Die Liste wird der Reihe nach abgearbeitet.
- Ein ungültiger Befehl wird einzeln abgelehnt, die übrigen gelten. Die Antwort nennt Position und Grund.
- Höchstens 200 Befehle je Tick.
- Je Tick zählt die erste Einreichung. Eine zweite für denselben Tick wird mit `already_submitted` abgewiesen.

### Flugzeit

`Ticks = max(1, aufrunden(Abstand / speed))`, Abstand ist die gerade Strecke zwischen den Planeten. Eine Flotte, die auf den Stand von Tick `t` losgeschickt wird, hat `depart = t` und `arrive = t + Ticks`.

### Kampf

Für jeden Planeten, an dem in einem Tick Flotten ankommen:

- Kräfte werden je Partei summiert: die Garnison zählt für den Besitzer (auch für „neutral"), ankommende Flotten für ihren Spieler.
- Gibt es nur eine Partei, ist es Verstärkung: die Schiffe werden addiert.
- Sonst gewinnt die größte Kraft. Sie behält die Differenz zur zweitgrößten, alle anderen sind vernichtet. Das ist der 1:1-Abtausch, gleichzeitig für alle Parteien.
- Sind die beiden größten Kräfte gleich, bleibt der Planet beim bisherigen Besitzer, mit 0 Schiffen.

Die Reihenfolge der Flotten spielt keine Rolle. Ein Angreifer braucht also mehr Schiffe als die Garnison, nicht gleich viele.

### Ende

- **Auslöschung:** Hat ein Spieler nach einem Tick keinen Planeten und keine Flotte mehr, verliert er sofort. Trifft das beide im selben Tick, ist es unentschieden.
- **Tick-Limit** (Standard 300): Es gewinnt, wer mehr Schiffe hat, Planeten und Flotten zusammen. Bei Gleichstand entscheidet die höhere Summe der Produktionsraten. Ist auch die gleich, ist es unentschieden.

## 2. Takt und Fristen

- Tick `t` wird für beide Sitze im selben Moment veröffentlicht. Befehle des Gegners sieht niemand vor der Auflösung.
- Aufgelöst wird, sobald alle anwesenden externen Bots eingereicht haben und `tickMs` seit der Veröffentlichung vergangen ist. Spätestens nach `timeoutMs` wird aufgelöst, wer nichts eingereicht hat, setzt aus.
- Standard: `tickMs` 300, `timeoutMs` 2000. Der erste Tick hat mindestens 5 Sekunden Frist.
- Verpasst ein Bot 5 Fristen in Folge, gilt er als abwesend. Auf ihn wird nicht mehr gewartet, bis er wieder einreicht. Das Match läuft weiter.
- Eingebaute Bots rechnen im Server auf demselben Stand und halten nie auf.

## 3. HTTP-Grundlagen

- Basis: `https://match-server-81dg.onrender.com`. Alles ist JSON, alle Antworten tragen `Cache-Control: no-store`.
- Fehler: `{ "error": { "code": "…", "message": "…" } }` mit passendem Status.
- **Warten:** Endpunkte mit `wait=<Sekunden>` halten die Verbindung, bis es etwas Neues gibt, höchstens 25 Sekunden. Gibt es nichts Neues, kommt `204` ohne Body.
- **Spieler-Token:** `Authorization: Bearer <token>`.
- **Arena-Schlüssel:** Ist beim Server `ARENA_KEY` gesetzt, brauchen Anlegen und Abbrechen den Kopf `X-Arena-Key: <schlüssel>`. `GET /api/health` meldet das in `arenaKeyRequired`. Lesen und Beitreten gehen immer ohne.
- **Schlafmodus:** Der Server schläft nach 15 Minuten ohne Anfrage ein und vergisst dabei alles. Der erste Aufruf danach kann eine Minute dauern. Vor dem Anlegen `GET /api/health` aufrufen und bei Zeitüberschreitung wiederholen. `bootId` ändert sich bei jedem Neustart.

## 4. Endpunkte

### Allgemein

| Aufruf | Zweck |
|---|---|
| `GET /api/health` | Lebenszeichen, `bootId`, eingebaute Bots, Standardwerte und Grenzen. Typ `HealthResponse`. |

### Matches

| Aufruf | Zweck |
|---|---|
| `POST /api/matches` | Match anlegen. Body `CreateMatchRequest`, Antwort `201` mit `MatchResponse`. |
| `GET /api/matches?limit=50` | Liste, neueste zuerst. `MatchListResponse`. |
| `GET /api/matches/{id}` | Kopf, Karte und Auftragstext. `MatchResponse`. |
| `GET /api/matches/{id}/replay?from=0&since=<version>&wait=25` | Frames ab Tick `from`. `ReplayResponse`. Live-Strom und Replay in einem. |
| `POST /api/matches/{id}/abort` | Match abbrechen. |

`POST /api/matches` ohne `players` legt zwei offene Plätze an. Das Match startet, sobald beide Sitze besetzt sind. Mit `"demo": true` spielen zwei eingebaute Bots sofort gegeneinander.

`replay` wartet, solange es keinen Frame ab `from` gibt und das Match nicht beendet ist. Mit `since=<match.version>` kehrt der Aufruf auch zurück, wenn sich nur der Kopf geändert hat (Beitritt, Start, `online`, `absent`, Ende), dann mit leerem `frames`. Die Antwort mit `from=0` ist die Replay-Datei.

Die Karte steht mit dem Anlegen fest, Frame 0 ist sofort abrufbar, auch solange das Match noch auf Bots wartet.

Ein Match, das der Server nicht (mehr) kennt, beantwortet er mit `404` und Code `match_not_found`. Hat sich zugleich `bootId` in `GET /api/health` geändert, wurde der Server neu gestartet.

### Für Bots

| Aufruf | Zweck |
|---|---|
| `POST /api/matches/{id}/join` | Offenen Platz besetzen. Body `{ "name": "…" }`, Antwort `JoinResponse` mit `token`. |
| `GET /api/matches/{id}/state?wait=25` | Stand aus Sicht des Bots. `PlayerState`. Mit `wait` kommt die Antwort, sobald der Bot am Zug ist (Match läuft, für den Tick noch nichts eingereicht) oder das Match vorbei ist. |
| `POST /api/matches/{id}/orders?wait=25` | Befehle einreichen. Body `OrdersRequest`, Antwort `OrdersResponse`. Mit `wait` kommt der nächste Stand gleich mit: ein Aufruf je Tick genügt. |

Ablauf eines Bots:

1. `join`, Token merken.
2. `state?wait=25` holen. Bei `204` wiederholen: das Match wartet noch auf den Gegner.
3. Befehle für `state.tick` berechnen und mit `orders?wait=25` einreichen.
4. Die Antwort enthält `state` für den nächsten Tick. Weiter bei 3, bis `state.match.status` nicht mehr `running` ist.
5. Ist `state` in der Antwort `null` oder gab es einen Netzfehler: weiter bei 2.

Reicht ein Bot für einen alten Tick ein, kommt `409` mit Code `stale_tick` und dem aktuellen Tick. Reicht er für denselben Tick zweimal ein, kommt `409` mit `already_submitted`. In beiden Fällen weiter bei 2.

Die Vorlage `examples/bot.mjs` setzt genau diesen Ablauf um.

### Serien (geplant)

Eine Serie spielt Best-of-1, 3 oder 5 zwischen denselben zwei Teilnehmern. Ein Bot tritt der Serie einmal bei, sein Token gilt für alle Matches darin. Die Sitze wechseln von Spiel zu Spiel, jedes Spiel hat eine eigene Karte (`seed + Spielnummer - 1`).

| Aufruf | Zweck |
|---|---|
| `POST /api/series` | Serie anlegen. Body `CreateSeriesRequest`, Antwort `201` mit `SeriesResponse`. |
| `GET /api/series` | Liste. `SeriesListResponse`. |
| `GET /api/series/{id}?since=<version>&wait=25` | Stand, Spiele, laufendes Match. `SeriesResponse`. |
| `POST /api/series/{id}/join` | Platz in der Serie besetzen. Antwort `SeriesJoinResponse`. |
| `GET /api/series/{id}/me?since=<version>&wait=25` | Für Bots: in welchem Match und auf welchem Sitz geht es weiter. `SeriesPlayerState`. |
| `POST /api/series/{id}/abort` | Serie abbrechen. |

Ablauf eines Bots in einer Serie: beitreten, mit `me` auf `current` warten, das Match wie oben spielen, wieder `me` fragen, bis `series.status` `finished` oder `aborted` ist.

## 5. Frames lesen

Ein Frame beschreibt den Stand nach Auflösung von Tick `t`:

- `planets[i]` ist `[Besitzer, Garnison]` des Planeten `i`. Besitzer ist `0`, `1` oder `null` für neutral.
- `launches` sind die Flotten, die beim Auflösen dieses Ticks gestartet sind, also `depart === t - 1`. Position zum Zeitpunkt `τ`: Anteil `(τ - depart) / (arrive - depart)` der Strecke von `from` nach `to`.
- `events` nennt je Planet mit Ankünften die angekommenen Schiffe je Sitz, den Stand davor (nach Produktion) und danach.
- `players[sitz]` enthält Schiffe, Produktion, Planetenzahl und ob für den Tick davor rechtzeitig Befehle kamen.
- `at` sind die Millisekunden seit Match-Start. Damit lässt sich ein Replay im echten Tempo abspielen.

Alle Flotten im Flug zu Tick `t` ergeben sich aus den `launches` aller Frames bis `t` mit `arrive > t`.

## 6. Lokal ohne Server

`src/lib/planetwars/` ist reiner Code ohne Node-Abhängigkeiten. `simulate()` spielt ein ganzes Match zwischen zwei Bot-Funktionen und liefert dieselben Frames wie der Server. Ein Beispiel liegt in `fixtures/replay-beispiel.json`.
