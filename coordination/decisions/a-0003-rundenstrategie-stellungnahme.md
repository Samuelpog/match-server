---
nr: a-0003
thema: Gemeinsame Stellungnahme zum Vorschlag „Rundenstrategie" und Bauplan
von: agent-a
datum: 2026-11-13T10:00:00Z
status: vorgeschlagen (Fassung 2 aus a-0017, b-0013, b-0014 und a-0018, wartet auf Agent-B)
---

# a-0003: Stellungnahme zum Vorschlag „Rundenstrategie" und Bauplan

Grundlage: `docs/vorschlag-rundenstrategie.md` auf dem Branch `claude/cool-bell-b02hyu`. Gebaut wird erst nach der Freigabe durch beide Menschen.

## 1. Empfehlung

Wir empfehlen, den Regelkern anzunehmen: Runden, Aktionslimit, Routen, Kampf auf der Route, verdeckte gleichzeitige Züge, kein Zufall, Heimatplanet als Sofortsieg. Das alte Spiel wird ersetzt.

Wir empfehlen neun Änderungen am Vorschlag (Abschnitt 3). Die wichtigsten drei:

- Der Takt wird eine Einstellung des Matches.
- Schiffstypen und Nebel werden eigene Stufen. Jede wird erst nach einer Messung der Stufe davor freigegeben.
- Der Nebel braucht eine Fairness-Regel, weil er sich technisch nicht dicht machen lässt.

## 2. Messung am heutigen Spiel

2400 Simulationen mit den eingebauten Bots (200 Karten, je beide Sitzverteilungen, 24 Planeten):

| Befund | Wert |
|---|---|
| Befehle je Tick und Sitz | im Schnitt 0,7 bis 2,6, höchstens 23, erlaubt 200 |
| Länge `expansion` gegen `sturm` | im Schnitt 92 Ticks, also 28 Sekunden |
| Ende durch Eliminierung | 2400 von 2400 |
| `expansion` gegen `sturm` | 242 : 158 |

Der Vorschlag begründet den Umbau mit der Befehlsmenge. Die Messung zeigt etwas anderes: Die Bots spammen nicht. Das Match ist zu kurz zum Mitlesen, und wer die erste große Schlacht verliert, verliert alles. Die Richtung des Vorschlags stimmt trotzdem, die Hebel sind Tempo, Festlegung und Lesbarkeit.

## 3. Änderungen am Vorschlag

| Nr. | Thema | Der Vorschlag sagt | Wir empfehlen | Grund |
|---|---|---|---|---|
| Ä1 | Takt | 8 s je Runde, 5 s Rechenzeit, fest | Zwei Regler je Match: `timeoutMs` (Frist) und `roundMs` (Mindestdauer der Runde). Aufgelöst wird, sobald beide eingereicht haben und `roundMs` vorbei ist. Voreinstellungen: „Turnier" 8 s und 5 s, „Test" 100 ms und 2 s. | Bots antworten in Millisekunden. Testläufe dürfen keine 16 Minuten dauern. |
| Ä2 | Karte | offen | 14 bis 18 Planeten, 2 bis 4 Routen je Planet, Routenlänge 1 bis 3 Runden, Heimatplaneten mindestens 4 Routen auseinander. Anforderungen in Abschnitt 5. | Mit 3 Aktionen bleiben auf 20 bis 30 Planeten die meisten liegen. Lesbar auf dem Handy. Weicht vom Pflichtenheft ab. |
| Ä3 | Bewegung | „Flotte bewegen" | Eine Aktion schickt eine Flotte über genau eine Route zum Nachbarn. Gegenläufige Flotten auf derselben Route kämpfen in der Runde, in der sie aneinander vorbeikämen, gleichläufige nie. Neue Aktionsart **Nachschublinie**: Ein Planet schickt ab dann jede Runde über eine Route weiter, was durch Produktion oder Nachschub bei ihm dazukommt. Die Linie gilt, bis sie geändert wird oder der Planet fällt. Nachschub kann abgefangen werden. | Der Gegner bekommt in jeder Runde eine Konter-Möglichkeit. Die Linie nimmt der Logistik die Aktionen ab und zeigt den Aufmarsch auf der Karte. |
| Ä4 | Schiffstypen | Stufe 2, zusammen mit Ausbauten | Eigene Stufe nach den Ausbauten. Eine Flotte hat genau einen Typ, ein Planet hält Bestände je Typ. Der Konter ist ein fester Faktor um 1,5. Die Produktion umzustellen dauert einige Runden. | Die Kampfregel muss in einen Satz passen. Gemischte Flotten sind auf dem Handy nicht lesbar. Solange man die Produktion des Gegners sieht, ist der Konter eine Antwort und kein Raten. |
| Ä5 | Nebel | Stufe 3 | Letzte Stufe mit eigener Freigabe. Radar und Aufklärung kommen mit ihm. Planeten, Routen und Wachstum bleiben öffentlich, verdeckt sind Besitz, Besatzung, Flotten und Ausbauten. | Der Zuschauer-Strom ist offen lesbar. Schließen lässt sich das nicht, weil jeder Mensch Zuschauer und Bot-Besitzer zugleich ist. |
| Ä6 | Aufklärung | „Sektor Nord" | Zielt auf einen Planeten und zeigt ihn und seine Routen für 3 Runden, samt Produktionsart. | Sektoren wären ein zusätzliches Konzept. |
| Ä7 | Sieg | Heimatplanet sofort, sonst Punkte aus Planeten und Ausbauten | Der Heimatplanet hat eine feste Grundverteidigung. Fallen beide in derselben Runde, entscheiden die Punkte. Punkte sind die Summe des Wachstums der eigenen Planeten plus ein fester Wert je Ausbau. Bei Gleichstand entscheiden die Schiffe, sonst ist es unentschieden. Der Punktestand steht in jedem Frame. | Sonst lohnt der blinde frühe Sturm. Die Anzeige „wer führt" muss dieselbe Größe sein, die am Ende entscheidet. |
| Ä8 | Kommandozentrale | auf jedem Planeten, höchstens 5 Aktionen | Nur auf drei Knotenplaneten baubar: dem Mittelplaneten und einem Flankenpaar. Alle drei sind von beiden Heimatplaneten gleich viele Runden entfernt. | Sonst baut jeder zuerst zwei Kommandozentralen im Hinterland. So wird um die vierte und fünfte Aktion gekämpft. |
| Ä9 | Abnahme | Balance „mit dem Simulator" | Feste Kriterien je Stufe, Abschnitt 7. | Sonst entscheidet Gefühl. |

## 4. Was unverändert übernommen wird

- Aktionslimit: 3 je Runde, höchstens 5.
- Ein Ausbauplatz je Planet, eine Eroberung zerstört den Ausbau.
- Zuschauer sehen alles, mit Rundenprotokoll und rundenweiser Zeitleiste.
- Ein Spiel statt zwei Modi.
- Lokaler Simulator, stärkere eingebaute Bots, neue Bot-Vorlage und neue `docs/API.md`.
- Arena, Fristen, Serien und Replay-Strom bleiben.

## 5. Karte und Rundenablauf

**Karte**

- Punktgespiegelt wie heute.
- Routen kreuzen sich nicht und laufen nicht dicht an einem dritten Planeten vorbei.
- Die Länge einer Route in Runden folgt ihrer gezeichneten Länge.
- Die Karte nennt `home` je Sitz und `hub` für die Knotenplaneten.
- Jeder Planet hat einen Namen aus einer festen Liste, gezogen aus dem `seed`. Server, Protokoll und Bots benutzen dieselben Namen.

**Reihenfolge innerhalb einer Runde**, fest und für beide Seiten gleich:

1. Aktionen werden geprüft und ausgeführt (Start von Flotten, Baubeginn, Linien, später Umstellen und Aufklären).
2. Bewegung.
3. Kampf auf der Route.
4. Ankunft und Kampf am Planeten.
5. Produktion und Nachschub.
6. Bau wird fertig.
7. Sieg wird geprüft, Punkte werden berechnet.

Die genauen Regeln und Startwerte stehen im Design-Papier (Stufe 0).

## 6. Bauplan

### Ablauf

1. Beide Menschen geben diese Stellungnahme frei und beantworten die Fragen in Abschnitt 9.
2. Stufe 0: Agent-A schreibt Regeln und Schnittstelle als `a-0004-regeln-v2`. Die Ansicht steht in Abschnitt 8. Das Design geht zur Freigabe an die Menschen.
3. Je Stufe liefert Agent-A zuerst die Typen und eine echte Beispiel-Datei aus dem Simulator. Agent-B baut dagegen, während Agent-A die Arena umstellt.
4. Jede Stufe ist spielbar, endet mit der Messung nach Abschnitt 7 und mit einem Pull Request nach `main`, den die Menschen auslösen. Bis Stufe 1 auf beiden Seiten steht, bleibt `main` beim heutigen Spiel.

### Stufen

| Stufe | Inhalt | Agent-A | Agent-B |
|---|---|---|---|
| 0 | Design | Regeln mit Startwerten, Schnittstelle, Frame-Format | Rückmeldung aus Sicht der Ansicht |
| 1 | Runden, Aktionslimit, Routen, Kampf auf der Route, Heimatsieg, Punkte | Engine, Kartengenerator mit Namen und Knoten, Arena, Simulator als Befehl, ein eingebauter Bot, Bot-Vorlage, `docs/API.md` | Modell und Adapter neu, Routen, Flotten entlang der Route, Kampf auf der Route, Rundenprotokoll, Aktionszähler, Zeitleiste in Runden, Lobby-Voreinstellungen, `/vorschau` |
| 2 | Ausbauten (Werft, Festung, Kommandozentrale), Nachschublinien | Engine, zweiter Bot | Zeichen für Ausbau und Baufortschritt, fließende Nachschublinien, Kräfte-Anzeige nach Punkten |
| 3 | Schiffstypen, Produktion umstellen. Freigabe nach der Messung von Stufe 2. | Engine, Kampfregel, dritter Bot | Formen der Typen, Bestände je Typ |
| 4 | Nebel, Radar, Aufklärung. Eigene Freigabe nach Stufe 3. | Filter je Sitz, Sichtbarkeit im Frame, Fairness-Regel im Auftragstext | Umschaltbare Sicht, Aufklärung in der Ansicht |
| 5 | Einfrieren | Balance, Dokumentation, Regel-Kennung | Feinschliff |

### Schnittstelle

- Sie hat von Stufe 1 an ihre Endform: Aktionen mit `type`, Sichtfelder je Sitz, ein Regel-Kennzeichen im Match-Kopf, Replay-Format `version: 2`. Bis zum Nebel ist alles sichtbar. Alte Replay-Dateien werden mit klarer Meldung abgelehnt.
- Der Zuschauer-Strom enthält je Runde:
  - die vollständige Liste der Flotten unterwegs mit fester `id`, Nachschub gekennzeichnet,
  - Planeten mit Besitzer, Bestand, Nachschublinie, Ausbau und Runde der Fertigstellung,
  - die Aktionen beider Seiten, auch abgelehnte mit Grund,
  - Ereignisse mit ihrem Schritt aus Abschnitt 5, Stärken vorher und nachher und den beteiligten Flotten; der Ort eines Kampfes auf der Route darf halbe Runden haben,
  - Sicht je Sitz, Punktestand, genutzte und verfügbare Aktionen.
- Eingebaute Bots rechnen höchstens im niedrigen zweistelligen Millisekundenbereich je Runde, weil sie im einzigen Prozess des Servers laufen.

### Einfrieren

Nach der letzten freigegebenen Stufe wird der Regelstand eingefroren und bekommt eine Kennung. Erst gegen diesen Stand werden die Turnier-Bots gebaut. Danach ändern sich Regeln und Zahlenwerte nicht mehr ohne Ansage.

## 7. Abnahme je Stufe

Gemessen mit dem Simulator über 500 Karten. Alle Zahlen sind Startwerte.

- Gespiegelte Bots auf gespiegelter Karte enden unentschieden.
- Der stärkere eingebaute Bot schlägt den schwächeren in mindestens 85 %.
- Ein reiner Sturm-Bot auf den Heimatplaneten gewinnt gegen den Standard-Bot höchstens 30 %.
- Zwischen 20 % und 60 % der Spiele enden vor der letzten Runde.
- In mindestens 25 % der Spiele wechselt nach Runde 30 die Führung nach Punkten.
- Keine Eröffnung und kein Ausbau kommt in über 80 % der Siege vor.

## 8. Ansicht

Text von Agent-B aus `b-0014`. Im Papier heißen die Seiten Spieler 1 und Spieler 2, in der Ansicht Blau und Orange.

**Schlachtfeld.** Routen als Linien, Heimat- und Knotenplaneten markiert, Planeten mit Namen, Besatzung, Produktion und Ausbau samt Baufortschritt. Flotten ziehen entlang der Route, Nachschublinien erscheinen als fließende Linie. Kämpfe auf der Route und am Planeten werden an ihrem Ort gezeigt.

**Runde.** Die Ansicht zeigt jede Runde in festen Schritten: Befehle, Bewegung, Kampf, Ergebnis. Ein Rundenprotokoll nennt je Runde die Aktionen beider Seiten, auch abgelehnte. Ein Klick auf einen Eintrag springt zu dieser Runde.

**Stand.** Die Kräfte-Anzeige zeigt die Punkte, die am Ende entscheiden, dazu Schiffe, Produktion und Aktionen je Seite. Die Zeitleiste zählt Runden und markiert Eroberungen.

**Abspielen.** Pause, zurück, vor und Tempo wie heute, in laufenden und beendeten Matches. Ein Replay läuft mit festem Schautempo je Runde, unabhängig vom Spieltempo.

**Sicht (ab Stufe 4).** Umschaltbar zwischen Spieler 1, Spieler 2 und allem. Was eine Seite nicht sieht, wird abgedunkelt.

**Schiffstypen (ab Stufe 3).** Eine Flotte zeigt ihren Typ als Form. Ein Planet zeigt die Gesamtzahl und einen dreigeteilten Balken, die Einzelwerte beim Antippen.

**Lobby.** Voreinstellungen „Turnier" und „Test", Serien wie heute.

**Entfällt.** Replays des alten Spiels sind nicht mehr abspielbar. Die Ansicht lehnt sie mit einer klaren Meldung ab und räumt die im Browser gespeicherten weg.

**Bleibt unverändert.** Lobby-Aufbau, Serien, Replay-Ablage im Browser, Abspielsteuerung.

## 9. Fragen an die Menschen

| Nr. | Frage | Unsere Empfehlung |
|---|---|---|
| E1 | Regelkern mit den Änderungen Ä1 bis Ä9 annehmen und das alte Spiel ersetzen? | Ja. |
| E2 | 14 bis 18 Planeten statt 20 bis 30 aus dem Pflichtenheft? | Ja. |
| E3 | Turnier mit 8 s je Runde (16 Minuten je Match) und Serien über drei Spiele? | Ja. Fünf Spiele dauern über 80 Minuten. |
| E4 | Schiffstypen als eigene Stufe, Freigabe nach der Messung von Stufe 2? | Ja. |
| E5 | Nebel als letzte Stufe mit eigener Freigabe und der Fairness-Regel „ein Bot ruft nur `join`, `state`, `orders` und `me` auf"? | Ja. Die Regel steht dann in `docs/API.md` und im Auftragstext für Bots. |
| E6 | Ab wann werden die Turnier-Bots gebaut? | Erst gegen den eingefrorenen Regelstand. Den Zeitpunkt legt ihr fest. |

## 10. Verlauf

Fassung 1 entstand aus `a-0017` und `b-0013`. `b-0014` und `a-0018` haben sich gekreuzt, dabei hat jeder dem anderen nachgegeben. Fassung 2 legt die strittigen Punkte fest:

| Punkt | Festgelegt | Stammt aus |
|---|---|---|
| Bewegung | Zug zum Nachbarn plus Nachschublinie mit Durchleiten | `a-0017` V3, `b-0014` E2 |
| Reihenfolge | Schiffstypen vor Nebel, beide als eigene Stufe mit Freigabe | `b-0013` 2.3, `a-0017` V4 |
| Punkte | ohne Schiffe, Schiffe nur bei Gleichstand | `a-0017` V8, `b-0014` |
| Standardtakt | Turnier 8 s | Vorschlag, `b-0014` |
| Kommandozentrale | nur auf drei Knotenplaneten | `a-0017` V5, `b-0014` E3 |
| Zuschauer-Token | entfällt, Fairness-Regel | `b-0014` F4 |
| Papiere | diese Stellungnahme samt Ansicht, danach `a-0004-regeln-v2` | `b-0014`, `b-0013` |
