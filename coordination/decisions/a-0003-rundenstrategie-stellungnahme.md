---
nr: a-0003
thema: Gemeinsame Stellungnahme zum Vorschlag „Rundenstrategie" und Bauplan
von: agent-a
datum: 2026-11-13T09:52:00Z
status: vorgeschlagen (Entwurf aus a-0017 und b-0013, wartet auf Agent-B)
---

# a-0003: Stellungnahme zum Vorschlag „Rundenstrategie" und Bauplan

Grundlage: `docs/vorschlag-rundenstrategie.md` auf dem Branch `claude/cool-bell-b02hyu`, dazu `a-0017` und `b-0013`. Gebaut wird erst nach der Freigabe durch beide Menschen.

## 1. Empfehlung

Wir empfehlen, den Regelkern anzunehmen: Runden, Aktionslimit, Routen, Kampf auf der Route, verdeckte gleichzeitige Züge, kein Zufall, Heimatplanet als Sofortsieg. Das alte Spiel wird ersetzt.

Wir empfehlen neun Änderungen am Vorschlag (Abschnitt 3). Die wichtigsten drei:

- Der Takt wird eine Einstellung des Matches.
- Schiffstypen und Nebel werden eigene Stufen, die einzeln gemessen und freigegeben werden.
- Der Nebel braucht eine Fairness-Regel zwischen den Menschen, weil er sich technisch nicht dicht machen lässt.

## 2. Messung am heutigen Spiel

2400 Simulationen mit den eingebauten Bots (200 Karten, je beide Sitzverteilungen, 24 Planeten):

| Befund | Wert |
|---|---|
| Befehle je Tick und Sitz | im Schnitt 0,7 bis 2,6, höchstens 23, erlaubt 200 |
| Länge `expansion` gegen `sturm` | im Schnitt 92 Ticks, also 28 Sekunden |
| Ende durch Eliminierung | 2400 von 2400 |
| `expansion` gegen `sturm` | 242 : 158 |

Die Bots spammen nicht. Das Match ist zu kurz zum Mitlesen, und wer die erste große Schlacht verliert, verliert alles. Die Richtung des Vorschlags stimmt, die Hebel sind Tempo, Festlegung und Lesbarkeit.

## 3. Änderungen am Vorschlag

| Nr. | Thema | Der Vorschlag sagt | Wir empfehlen | Grund |
|---|---|---|---|---|
| Ä1 | Takt | 8 s je Runde, 5 s Rechenzeit, fest | Zwei Regler je Match: `timeoutMs` (Frist, 5 s) und `roundMs` (Mindestdauer der Runde, 100 ms bis 10 s). Aufgelöst wird, sobald beide eingereicht haben und `roundMs` vorbei ist. | Bots antworten in Millisekunden. Testläufe dürfen keine 16 Minuten dauern. |
| Ä2 | Kartengröße | offen | 14 bis 18 Planeten, 2 bis 4 Routen je Planet, Routenlänge 1 bis 3 Runden, Heimatplaneten mindestens 4 Routen auseinander. Offen zwischen A und B. | Mit 3 Aktionen bleiben auf 20 bis 30 Planeten die meisten liegen. Weicht vom Pflichtenheft ab. |
| Ä3 | Bewegung | „Flotte bewegen" | Ziel ist ein beliebiger Planet. Der Bot nennt den Weg als Planetenfolge, er ist nicht umlenkbar. Eigene Planeten werden durchflogen, am ersten fremden wird gekämpft. Gegenläufige Flotten auf derselben Route kämpfen in der Runde, in der sie aneinander vorbeikämen. Gleichläufige nie. | Sonst frisst Logistik alle Aktionen. Festungen werden zu Sperren. |
| Ä4 | Schiffstypen | Stufe 2, zusammen mit Ausbauten | Eigene Stufe nach den Ausbauten und vor dem Nebel. Eine Flotte hat genau einen Typ, ein Planet hält Bestände je Typ. Der Konter ist ein fester Faktor um 1,5. Die Produktion umzustellen dauert einige Runden. | Die Kampfregel muss in einen Satz passen. Solange man die Produktion des Gegners sieht, ist der Konter eine Antwort und kein Raten. |
| Ä5 | Nebel | Stufe 3 | Letzte Stufe und eigene Entscheidung nach Stufe 3. Radar und Aufklärung kommen mit ihm. Karte, Routen und Wachstum bleiben öffentlich. | Der Zuschauer-Strom ist offen lesbar, ein Bot könnte dort mitlesen. Schließen lässt sich das nicht, weil jeder Mensch Zuschauer und Bot-Besitzer zugleich ist. Es braucht eine Fairness-Regel. |
| Ä6 | Aufklärung | „Sektor Nord" | Zielt auf einen Planeten und zeigt ihn und seine Nachbarn für einige Runden, samt Produktionsart. | Sektoren wären ein zusätzliches Konzept. |
| Ä7 | Sieg | Heimatplanet sofort, sonst Punkte aus Planeten und Ausbauten | Der Heimatplanet hat einen festen Verteidigerbonus. Fallen beide in derselben Runde, entscheiden die Punkte. Schiffe zählen mit kleinem Gewicht mit. Der Punktestand wird jede Runde berechnet und mitgeliefert. | Sonst lohnt der blinde frühe Sturm, und in den letzten Runden wären Schiffe wertlos. Die Anzeige „wer führt" muss dieselbe Größe sein, die am Ende entscheidet. |
| Ä8 | Kommandozentrale | eine Aktion mehr, höchstens 5 | Start wie im Vorschlag. Zeigt die Abnahme, dass sie zur Pflicht-Eröffnung wird, ist sie nur noch auf markierten Knotenplaneten baubar. | Eine Aktion mehr ist sehr stark. |
| Ä9 | Abnahme | Balance „mit dem Simulator" | Feste Kriterien je Stufe, Abschnitt 6. | Sonst entscheidet Gefühl. |

## 4. Was unverändert übernommen wird

- Aktionslimit: 3 je Runde, höchstens 5.
- Ein Ausbauplatz je Planet, eine Eroberung zerstört den Ausbau.
- Zuschauer sehen alles, mit Rundenprotokoll und rundenweiser Zeitleiste.
- Ein Spiel statt zwei Modi. Alte Replay-Dateien werden mit klarer Meldung abgelehnt.
- Lokaler Simulator, stärkere eingebaute Bots, neue Bot-Vorlage und neue `docs/API.md`.
- Arena, Fristen, Serien und Replay-Strom bleiben.

## 5. Bauplan

### Ablauf

1. Beide Menschen geben diese Stellungnahme frei und beantworten die Fragen in Abschnitt 7.
2. Agent-A schreibt die Regeln als `a-0004-regeln-v2`, Agent-B die Ansicht als `b-0002-zuschauer-v2`. Beides geht zur Freigabe an die Menschen.
3. Je Stufe liefert Agent-A zuerst die Typen und eine echte Beispiel-Datei aus dem Simulator. Agent-B baut dagegen, während Agent-A die Arena umstellt.
4. Jede Stufe ist spielbar und endet mit einem Pull Request nach `main`, den die Menschen auslösen. Bis Stufe 1 auf beiden Seiten steht, bleibt `main` beim heutigen Spiel.

### Stufen

| Stufe | Inhalt | Agent-A | Agent-B |
|---|---|---|---|
| 0 | Design | Regeln mit Startwerten, Rundenablauf, Schnittstelle, Frame-Format | Ansicht, Rundenprotokoll, Auflösung in Schritten |
| 1 | Runden, Aktionslimit, Routen, Kampf auf der Route, Heimatsieg, Punkte | Engine, Kartengenerator, Arena, Simulator als Befehl, ein eingebauter Bot, Bot-Vorlage, `docs/API.md` | Modell und Adapter neu, Routen, Flotten entlang der Route, Kampf auf der Route, Rundenprotokoll, Aktionszähler, Zeitleiste in Runden, Lobby-Optionen, `/vorschau` |
| 2 | Ausbauten: Werft, Festung, Kommandozentrale | Engine, zweiter Bot, Abnahme-Messung | Zeichen für Ausbau und Baufortschritt, Kräfte-Anzeige nach Punkten |
| 3 | Schiffstypen, Produktion umstellen | Engine, Kampfregel, dritter Bot, Abnahme-Messung | Formen der Typen, Bestände je Typ |
| 4 | Nebel, Radar, Aufklärung (nach eigener Entscheidung) | Filter je Sitz, Sichtbarkeit im Frame, Schutz des Zuschauer-Stroms | Umschaltbare Sicht, Aufklärung in der Ansicht |
| 5 | Feinschliff und Einfrieren | Balance, Dokumentation | Feinschliff |

### Schnittstelle

- Die Schnittstelle hat von Stufe 1 an ihre Endform: Aktionen mit `type`, Sichtfelder je Sitz, ein Regel-Kennzeichen im Match-Kopf, Replay-Format `version: 2`. In den Stufen 1 bis 3 ist alles sichtbar.
- Der Zuschauer-Strom enthält je Runde: vollständige Flottenliste mit fester Kennung, Planeten mit Bestand und Ausbau, die Aktionen beider Seiten samt abgelehnter mit Grund, Ereignisse in fester Reihenfolge, Sicht je Sitz, Punktestand, genutzte und verfügbare Aktionen.
- Eingebaute Bots rechnen höchstens im niedrigen zweistelligen Millisekundenbereich je Runde, weil sie im einzigen Prozess des Servers laufen.

### Einfrieren

Sobald die Menschen mit ihren Bots beginnen, ändern sich Regeln und Zahlenwerte nicht mehr ohne Ansage. Das Regel-Kennzeichen zeigt, gegen welchen Stand ein Bot gebaut wurde.

## 6. Abnahme je Stufe

Gemessen mit dem Simulator über 500 Karten:

- Gespiegelte Bots auf gespiegelter Karte enden unentschieden.
- Der stärkere eingebaute Bot schlägt den schwächeren in mindestens 85 %.
- Ein reiner Sturm-Bot gewinnt gegen einen vernünftigen Verteidiger höchstens 30 %.
- Zwischen 20 % und 60 % der Spiele enden vor der letzten Runde.
- Keine Eröffnung und kein Ausbau kommt in über 80 % der Siege vor.

## 7. Fragen an die Menschen

| Nr. | Frage | Unsere Empfehlung |
|---|---|---|
| E1 | Regelkern mit den Änderungen Ä1 bis Ä9 annehmen und das alte Spiel ersetzen? | Ja. |
| E2 | Kartengröße: 14 bis 18 Planeten statt 20 bis 30 aus dem Pflichtenheft? | Ja, noch offen zwischen A und B. |
| E3 | Standardtakt im Turnier: 8 s (16 Minuten je Match, wie im Vorschlag) oder 4 s (8 Minuten)? | Agent-B empfiehlt 4 s mit Auflösung in drei Schritten. Wählbar ist beides. |
| E4 | Serienlänge im Turnier? | Drei Spiele. Fünf Spiele bei 8 s dauern über 80 Minuten. |
| E5 | Schiffstypen als eigene Stufe nach den Ausbauten? | Ja. |
| E6 | Nebel als letzte Stufe mit eigener Entscheidung und schriftlicher Fairness-Regel („der Bot liest nur seine eigenen Endpunkte")? | Ja. |

## 8. Offen zwischen Agent-A und Agent-B

- Kartengröße (Ä2).
- Lesbarkeit von drei Schiffstypen auf kleinem Bildschirm.
