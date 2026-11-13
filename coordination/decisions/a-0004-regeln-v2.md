---
nr: a-0004
thema: Regeln, Schnittstelle und Frame-Format der Rundenstrategie (Stufe 0)
von: agent-a
datum: 2026-11-13T09:58:18Z
status: vorgeschlagen (Entwurf, wartet auf Agent-B, danach auf die Menschen)
---

# a-0004: Regeln und Schnittstelle der Rundenstrategie

Grundlage: `a-0003`, Fassung 2. Dieses Papier ist Stufe 0 des Bauplans.

- **Verbindlich** für Stufe 1 und 2: Abschnitte 1 bis 9 und 11 bis 14.
- **Umriss** für Stufe 3 und 4: Abschnitt 10. Die genauen Regeln folgen mit der jeweiligen Freigabe.
- Alle Zahlen sind Startwerte. Sie stehen gesammelt in Abschnitt 9 und werden nach der Messung jeder Stufe nachgestellt.

Die Seiten heißen Spieler 1 und Spieler 2. In der Schnittstelle sind das die Sitze `0` und `1`.

## 1. Karte

| Eigenschaft | Regel |
|---|---|
| Feld | 200 × 140, ganzzahlige Koordinaten, Mittelpunkt (100, 70) |
| Anzahl | 15 oder 17 Planeten, Standard 15. Ungerade, weil es immer einen Mittelplaneten gibt. |
| Symmetrie | Punktspiegelung am Mittelpunkt. Jeder Planet außer dem Mittelplaneten hat einen Zwilling mit gleichem Wachstum und gleicher Besatzung. Zu jeder Route gibt es die gespiegelte. |
| Abstand | Zwei Planeten liegen mindestens 22 auseinander. |
| Routen | Ungerichtet. Eine Route gibt es nur bis zur Entfernung 75. Ihre Länge in Runden ist die Entfernung geteilt durch 25, aufgerundet, also 1 bis 3. |
| Lesbarkeit | Routen kreuzen sich nicht. Kein dritter Planet liegt näher als 12 an einer Route. |
| Netz | Zusammenhängend. Jeder Planet hat 2 bis 4 Routen. |
| Heimatplaneten | Ein Zwillingspaar. Der kürzeste Weg zwischen ihnen hat mindestens 4 Routen und mindestens 6 Runden. |
| Knotenplaneten | Drei: der Mittelplanet und ein Zwillingspaar an den Flanken. Jeder Knoten ist von beiden Heimatplaneten gleich viele Runden entfernt. |
| Namen | Jeder Planet hat einen Namen aus einer festen Liste, gezogen aus dem `seed`, eindeutig je Karte. |

Der Generator ist deterministisch: gleicher `seed` und gleiche Anzahl ergeben dieselbe Karte. Karten, die eine Regel verletzen, verwirft er und zieht neu.

Die ganze Karte ist öffentlich: Planeten, Routen, Wachstum, Namen, Heimat- und Knotenplaneten.

## 2. Start

- Jeder Spieler besitzt seinen Heimatplaneten mit 30 Schiffen und Wachstum 4.
- Alle anderen Planeten sind neutral. Ihre Besatzung ist Wachstum × 5 plus 0 bis 5 aus dem `seed`. Flanken-Knoten haben Wachstum 2 und 20 Schiffe, der Mittelplanet Wachstum 3 und 30 Schiffe.
- Neutrale Planeten produzieren nicht.

## 3. Takt

| Option | Bedeutung | Bereich | Standard |
|---|---|---|---|
| `rounds` | Zahl der Runden | 20 bis 200 | 120 |
| `roundMs` | Mindestdauer einer Runde | 100 bis 10000 | 8000 |
| `timeoutMs` | Frist für Befehle ab Rundenbeginn | 500 bis 30000 | 5000 |

- Voreinstellung „Turnier": 8000 und 5000. Voreinstellung „Test": 100 und 2000. Der Server nennt beide in `GET /api/health`.
- Eine Runde wird aufgelöst, sobald beides gilt: Alle anwesenden Bots haben eingereicht oder die Frist ist vorbei, und `roundMs` ist vorbei.
- Nach der Frist nimmt der Server für diese Runde nichts mehr an. Wer nichts einreicht, tut in der Runde nichts.
- Die erste Einreichung je Runde gilt, eine zweite wird abgelehnt.
- Wie heute: Wer fünf Fristen in Folge versäumt, gilt als abwesend. Auf ihn wird nicht mehr gewartet, bis er wieder einreicht.

Runden zählen von 1. Frame 0 ist der Start, Frame `r` der Stand nach Runde `r`.

## 4. Ablauf einer Runde

Fest und für beide Seiten gleich. Jedes Ereignis im Frame nennt seinen Schritt.

| Schritt | Kennung | Was geschieht |
|---|---|---|
| 1 | `actions` | Aktionen werden in der eingereichten Reihenfolge geprüft und ausgeführt. Flotten starten. |
| 2 | `move` | Jede Flotte, die nicht in dieser Runde gestartet ist, rückt eine Runde vor. |
| 3 | `route` | Kampf auf der Route. |
| 4 | `arrival` | Flotten am Ende ihrer Route kommen an: Verstärkung oder Kampf am Planeten. |
| 5 | `production` | Eigene Planeten produzieren. Nachschublinien schicken weiter. |
| 6 | `build` | Fertige Ausbauten werden wirksam. |
| 7 | `end` | Punkte werden berechnet, der Sieg wird geprüft. |

Eine Flotte, die in Runde `r` über eine Route der Länge `L` startet, kommt in Runde `r + L` an. Der Gegner sieht sie also mindestens eine Runde vorher.

## 5. Aktionen

- Ein Spieler hat 3 Aktionen je Runde. Jede fertige Kommandozentrale, die er zu Rundenbeginn besitzt, gibt eine mehr, höchstens 5.
- Gültige Aktionen zählen. Ungültige werden mit einem Grund abgelehnt und zählen nicht. Ist das Limit erreicht, wird der Rest mit `action_limit` abgelehnt.
- Je Einreichung prüft der Server höchstens 20 Aktionen.

| Aktion | Ab Stufe | Felder | Regel |
|---|---|---|---|
| `move` | 1 | `from`, `to`, `ships` | Von einem eigenen Planeten über genau eine Route zum Nachbarn. `ships` ist mindestens 1 und höchstens die Besatzung, die nach den früheren Aktionen dieser Runde noch da ist. Zwei Züge über dieselbe Route in derselben Runde bilden eine Flotte, kosten aber zwei Aktionen. |
| `build` | 2 | `planet`, `building` | Auf einem eigenen Planeten. Die Kosten gehen sofort von der Besatzung ab. Läuft dort schon ein Bau, wird abgelehnt. Ein fertiger Ausbau wird ersetzt und ist sofort weg. |
| `supply` | 2 | `planet`, `to` | Setzt die Nachschublinie eines eigenen Planeten auf einen Nachbarn oder löscht sie mit `to: null`. Gilt ab Schritt 5 derselben Runde. |
| `produce` | 3 | `planet`, `ship` | Stellt die Produktion um. Umriss in Abschnitt 10. |
| `scout` | 4 | `planet` | Aufklärung. Umriss in Abschnitt 10. |

Gründe für eine Ablehnung: `bad_action`, `bad_planet`, `not_owner`, `no_route`, `bad_ships`, `not_enough_ships`, `unknown_building`, `not_hub`, `slot_busy`, `not_available` (Aktion gibt es in dieser Stufe noch nicht), `action_limit`.

## 6. Kampf

### Auf der Route (Schritt 3)

- Zwei Flotten verschiedener Spieler kämpfen, wenn sie auf derselben Route in entgegengesetzter Richtung fliegen und sich in dieser Runde treffen oder aneinander vorbeikämen.
- Die größere Flotte überlebt mit der Differenz und fliegt weiter. Bei Gleichstand sind beide vernichtet.
- Treffen mehrere Flotten aufeinander, kämpfen zuerst die vordersten beider Richtungen. Der Sieger trifft danach auf die nächste.
- Flotten in gleicher Richtung kämpfen nie. Eigene Flotten fliegen aneinander vorbei.
- Wer eine ankommende Flotte auf der Route abfängt, kämpft ohne Festung und ohne Heimatschutz.

Der Ort des Kampfs wird als Abstand vom Planeten mit der kleineren Nummer angegeben, in Schritten von halben Runden. Zwei Flotten, die sich auf einer Route der Länge 1 entgegenfliegen, treffen sich bei 0,5.

### Am Planeten (Schritt 4)

1. Flotten des Besitzers verstärken die Besatzung.
2. Kommen fremde Flotten an, werden sie je Spieler zusammengezählt.
3. Die Verteidigung zählt mit ihrer Stärke: Besatzung, mit Festung anderthalbfach (abgerundet), am Heimatplaneten plus Heimatschutz.
4. Die stärkste Partei gewinnt und behält die Differenz zur zweitstärksten. Sind die beiden stärksten gleich, behält der Besitzer den Planeten mit 0 Schiffen.
5. Gewinnt ein Angreifer, gehört ihm der Planet. Ausbau, laufender Bau und Nachschublinie sind zerstört.
6. Gewinnt der Verteidiger, fängt zuerst der Heimatschutz Angreifer ab. Der Rest trifft die Besatzung, mit Festung kostet er nur zwei Drittel (aufgerundet).

**Heimatschutz:** Am Heimatplaneten kämpfen 15 zusätzliche Verteidiger mit, solange er seinem ersten Besitzer gehört. Sie können nicht ziehen und sind in jeder Runde wieder voll da.

Beispiel: Heimatplanet mit 20 Schiffen und Festung, Angriff mit 35. Stärke der Verteidigung: 30 + 15 = 45. Der Verteidiger gewinnt. Der Heimatschutz fängt 15 ab, die übrigen 20 kosten 14 Schiffe. Es bleiben 6.

## 7. Produktion, Nachschub, Ausbauten

### Produktion (Schritt 5)

Jeder Planet eines Spielers bekommt sein Wachstum an Schiffen dazu, mit Werft das Anderthalbfache (aufgerundet). Ein Planet, der in Schritt 4 erobert wurde, produziert schon für den neuen Besitzer.

### Nachschublinie (Stufe 2, Schritt 5)

- Ein Planet mit Linie schickt nach der Produktion alles weiter, was in dieser Runde durch Produktion oder ankommenden Nachschub dazugekommen ist. Die übrige Besatzung bleibt stehen.
- Die Schiffe fliegen als Nachschub-Flotte über die Route der Linie. Kommt sie an einem eigenen Planeten mit Linie an, wird sie in derselben Runde weitergeleitet. So entsteht eine Kette.
- Nachschub kann auf der Route abgefangen werden. Gehört das Ziel bei der Ankunft nicht mehr dem Absender, greift der Nachschub es an.
- Die Linie endet, wenn sie geändert wird oder der Planet fällt.

### Ausbauten (Stufe 2)

Ein Platz je Planet. Ein Bau, der in Runde `r` beginnt, ist in Schritt 6 der Runde `r + Bauzeit` fertig und wirkt ab der Runde danach.

| Ausbau | Kennung | Kosten | Bauzeit | Wirkung | Ab Stufe |
|---|---|---|---|---|---|
| Werft | `shipyard` | 20 | 4 | Produktion anderthalbfach | 2 |
| Festung | `fortress` | 15 | 3 | Besatzung verteidigt anderthalbfach | 2 |
| Kommandozentrale | `command` | 30 | 5 | Eine Aktion mehr je Runde. Nur auf Knotenplaneten. | 2 |
| Radar | `radar` | 10 | 2 | Größere Sichtweite | 4 |

## 8. Sieg und Punkte

- **Punkte:** Summe des Wachstums der eigenen Planeten (ohne Werft-Bonus) plus 2 je fertigem Ausbau. Sie werden in jeder Runde berechnet und stehen im Frame.
- **Sofortsieg:** Gehört nach Schritt 4 ein Heimatplanet dem Gegner, endet das Spiel in Schritt 7 dieser Runde. Sind beide Heimatplaneten gefallen, entscheiden die Punkte.
- **Nach der letzten Runde:** Mehr Punkte gewinnen. Bei Gleichstand gewinnt, wer mehr Schiffe hat (Besatzungen und Flotten). Ist auch das gleich, endet das Spiel unentschieden.

Ergebnis im Match: `winner` (Sitz oder `null`) und `reason`: `home`, `points`, `ships`, `draw` oder `aborted`.

## 9. Startwerte

| Wert | Start |
|---|---|
| Planeten | 15 |
| Runden | 120 |
| Aktionen | 3, höchstens 5 |
| Heimatplanet | 30 Schiffe, Wachstum 4, Heimatschutz 15 |
| Wachstum übrige Planeten | 1 bis 3 |
| Neutrale Besatzung | Wachstum × 5 plus 0 bis 5 |
| Routenlänge | 1 bis 3 Runden, 25 Einheiten je Runde |
| Faktor Werft und Festung | 1,5 |
| Punkte je Ausbau | 2 |

Kosten und Bauzeiten stehen in Abschnitt 7.

## 10. Umriss für Stufe 3 und 4

Nicht verbindlich. Festgelegt ist nur, was die Schnittstelle schon jetzt freihalten muss.

**Stufe 3, Schiffstypen.** Drei Typen: `fighter` schlägt `bomber`, `bomber` schlägt `cruiser`, `cruiser` schlägt `fighter`. Eine Flotte hat genau einen Typ, ein Planet hält Bestände je Typ und produziert einen Typ. Ein Schiff zählt anderthalbfach gegen den Typ, den es schlägt. Bomber ignorieren die Festung. Umstellen der Produktion kostet eine Aktion und 2 Runden ohne Produktion. Freigehaltene Felder: `ship` an Flotte und `move`, `stock` und `produces` am Planeten.

**Stufe 4, Nebel.** Ein Bot sieht eigene Planeten, deren Nachbarn und Flotten auf Routen dorthin. Radar erweitert die Sicht um eine Route. `scout` zeigt einen Planeten und seine Routen für 3 Runden, samt Produktionsart. Freigehaltene Felder: `visible` je Sitz im Frame, `visible` je Planet im Stand des Bots.

Spätere Stufen fügen nur Felder und Aktionsarten hinzu. Ein Bot oder eine Ansicht, die unbekannte Felder übergeht, läuft weiter.

## 11. Schnittstelle für Bots

Die Pfade bleiben. Geändert sind Felder und Inhalte.

| Aufruf | Änderung |
|---|---|
| `GET /api/health` | Neu: `rules`, `presets`. |
| `POST /api/matches`, `POST /api/series` | `options`: `seed`, `planets` (15 oder 17), `rounds`, `roundMs`, `timeoutMs`. `tickLimit` und `tickMs` entfallen. |
| `GET /api/matches/{id}` | Kopf mit `rules`, Karte im neuen Format. |
| `GET /api/matches/{id}/state` | Neuer Stand, siehe unten. |
| `POST /api/matches/{id}/orders` | Body `{ "round": Zahl, "actions": [...] }`. Antwort: je Aktion angenommen oder abgelehnt mit Grund, mit `wait` auch der nächste Stand. |
| `join`, `me`, `abort`, Serien | unverändert |

**Regel-Kennung:** `rules` hat die Form `rundenstrategie/<Stufe>.<Stand>`, zum Beispiel `rundenstrategie/1.0`. Ändert sich eine Regel oder ein Startwert, zählt der Stand hoch. Ein Bot kann die Kennung prüfen, gegen die er gebaut wurde.

**Stand für den Bot** (`state`), gekürzt:

```json
{
  "you": 0,
  "round": 47,
  "rounds": 120,
  "deadlineMs": 4180,
  "submitted": false,
  "actions": { "limit": 4 },
  "score": [14, 11],
  "planets": [
    { "id": 0, "name": "Vega", "x": 30, "y": 100, "growth": 4, "home": 0, "hub": false,
      "owner": 0, "ships": 42, "building": { "type": "fortress", "ready": 51 }, "supply": 5 }
  ],
  "routes": [[0, 5, 2]],
  "fleets": [
    { "id": 88, "owner": 1, "from": 7, "to": 5, "ships": 20, "progress": 1, "length": 2, "arrive": 48, "supply": false }
  ]
}
```

- `owner` ist `0`, `1` oder `null` für neutral.
- `building.ready` ist die Runde der Fertigstellung. Liegt sie in der Zukunft, wird noch gebaut.
- `supply` am Planeten ist das Ziel der Nachschublinie oder `null`.

**Fairness-Regel**, gültig ab Stufe 1 und wörtlich im Auftragstext und in `docs/API.md`: Ein Bot ruft nur `health`, `join`, `state`, `orders` und `me` auf. Der Zuschauer-Strom (`replay`) und die Match-Liste sind für Menschen.

## 12. Zuschauer-Strom und Replay

`GET /api/matches/{id}/replay` bleibt, mit `from`, `since` und `wait`. Die Antwort mit `from=0` ist weiterhin die Replay-Datei. Sie trägt `version: 2` und `match.rules`.

```ts
interface GameMap {
  seed: number; width: number; height: number;
  planets: PlanetDef[];            // Index ist die id
  routes: [a: number, b: number, length: number][];  // a < b
  homes: [number, number];
  hubs: number[];
}
interface PlanetDef {
  id: number; name: string; x: number; y: number; growth: number;
  home: Seat | null; hub: boolean; twin: number;
}
interface Frame {
  round: number;                   // 0 ist der Start
  at: number;                      // Millisekunden seit Beginn
  planets: PlanetState[];
  fleets: Fleet[];                 // alle Flotten unterwegs nach dieser Runde
  actions: [ActionRecord[], ActionRecord[]];
  events: GameEvent[];             // in der Reihenfolge der Schritte
  players: [SeatFrame, SeatFrame];
  visible: [Visibility, Visibility] | null;  // null: alles sichtbar
}
interface PlanetState {
  owner: Owner; ships: number;
  building: { type: BuildingType; ready: number } | null;
  supply: number | null;
}
interface Fleet {
  id: number; owner: Seat; from: number; to: number; ships: number;
  progress: number; length: number; arrive: number; supply: boolean;
}
interface ActionRecord { action: Action; ok: boolean; code?: RejectCode; fleet?: number }
type GameEvent =
  | { step: "route"; kind: "battle"; route: [number, number]; at: number;
      fleets: { id: number; owner: Seat; before: number; after: number }[] }
  | { step: "arrival"; kind: "reinforce" | "battle"; planet: number; fleets: number[];
      arrivals: [number, number];
      defense: { owner: Owner; ships: number; strength: number };
      after: { owner: Owner; ships: number };
      captured: boolean; destroyed: BuildingType | null }
  | { step: "production"; kind: "supply"; planet: number; fleet: number; ships: number }
  | { step: "build"; kind: "completed"; planet: number; building: BuildingType };
interface SeatFrame {
  submitted: boolean;
  actions: { used: number; limit: number };
  score: number; ships: number; growth: number; planets: number;
}
interface Visibility { planets: number[]; fleets: number[] }
```

- Eine Flotte behält ihre `id` von Start bis Ende. Fehlt sie im nächsten Frame, nennt ein Ereignis den Grund.
- Schritt 1 erzeugt keine eigenen Ereignisse. Die Aktionen stehen in `actions`, bei `move` mit der `id` der gestarteten Flotte.
- Die Produktion selbst erzeugt kein Ereignis, sie ergibt sich aus `growth` und Ausbau.
- Ein Replay spielt in der Ansicht mit festem Schautempo, unabhängig von `roundMs`.

## 13. Simulator und eingebaute Bots

- Befehl `npm run sim`: spielt zwei Bots ohne Server gegeneinander, über viele Karten und beide Sitzverteilungen, und gibt Siege, Spiellänge und die Kriterien aus `a-0003`, Abschnitt 7, aus.
- Ein Bot ist eine Funktion: Stand hinein (wie `state`), Liste von Aktionen heraus. Dieselbe Funktion läuft im Simulator und über die Bot-Vorlage gegen den Server.
- Eingebaute Bots in Stufe 1: `standard`, `sturm` (zieht nur auf den Heimatplaneten) und `passiv`. In Stufe 2 kommt ein Bot dazu, der baut und Linien setzt.
- Eingebaute Bots lösen Gleichstände spiegelsymmetrisch auf. Ein Test prüft, dass gespiegelte Bots unentschieden enden.
- Rechenzeit je Runde: höchstens im niedrigen zweistelligen Millisekundenbereich.

## 14. Ablage und Umstellung

- Neuer Code liegt in `src/lib/game/**` (Agent-A). `src/lib/planetwars/**` wird am Ende von Stufe 1 gelöscht.
- `src/lib/arena/api-types.ts` wird in Stufe 1 auf meinem Branch umgestellt. `main` behält das alte Spiel, bis Stufe 1 auf beiden Seiten steht.
- Reihenfolge in Stufe 1: zuerst `src/lib/game/types.ts` und `fixtures/replay-v2-stufe1.json` aus dem Simulator, dann Arena und Endpunkte, dann `docs/API.md` und Bot-Vorlage.
- Je Stufe entsteht eine neue Beispiel-Datei.

## 15. Fragen an Agent-B

1. Reicht dir das Frame-Format in Abschnitt 12, so wie es dasteht? Was fehlt, was ist überflüssig?
2. Planeten im Frame als Objekte statt als Tupel wie heute: einverstanden?
3. Ist die Ortsangabe „Abstand vom Planeten mit der kleineren Nummer" für dich die bequemste?
4. Brauchst du in `SeatFrame` mehr als Punkte, Schiffe, Wachstum, Planeten und Aktionen?
