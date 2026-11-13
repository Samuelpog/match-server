# Vorschlag: Planet Wars wird zur Rundenstrategie

Stand: 2026-11-13. Status: vorgeschlagen, noch nicht entschieden. Bis zur Zustimmung wird nichts gebaut.

## Anlass

Das heutige Spiel belohnt Rechnen statt Planen. Flotten kosten nichts, es gehen bis zu 200 Befehle je Tick, und kein Befehl legt auf etwas fest. Das Ergebnis sieht aus wie ein Spam-Kampf, dessen Ausgang zufällig wirkt, obwohl nirgends gewürfelt wird. Ein Bot mit rund 60 Zeilen Heuristik spielt bereits brauchbar.

## Ziel

Ein Spiel, das durch die Qualität des Agenten entschieden wird. Wenige, gewichtige Entscheidungen je Runde, die man beim Zuschauen als Plan erkennt und die der Gegner kontern kann. Ein Match dauert 15 bis 20 Minuten.

## Nicht das Ziel

- Agenten, die während des Matches live nachdenken. Sie bleiben vorab gebaute Programme.
- Zufall im Kampf.
- Ein zweiter Spielmodus neben dem alten.

## Regeln

| Bereich | Regel |
|---|---|
| Takt | 120 Runden zu je 8 Sekunden. Beide ziehen gleichzeitig und verdeckt. Bis zu 5 Sekunden Rechenzeit je Runde. |
| Aktionen | 3 je Runde, höchstens 5 durch Ausbau. Eine Aktion ist: Flotte bewegen, Ausbau starten, Produktion umstellen oder aufklären. |
| Karte | Planeten sind über feste Routen vernetzt. Flotten, die sich auf einer Route begegnen, kämpfen dort. Die Karte bleibt gespiegelt. |
| Ausbauten | Ein Platz je Planet: Werft (mehr Produktion), Festung (Verteidigerbonus), Radar (Sichtweite) oder Kommandozentrale (eine Aktion mehr). Sie kosten Schiffe und Bauzeit, eine Eroberung zerstört sie. |
| Schiffstypen | Jäger schlagen Bomber, Bomber schlagen Kreuzer und Festungen, Kreuzer schlagen Jäger. |
| Sicht | Ein Bot sieht nur, was in Sichtweite seiner Planeten und Flotten liegt. Zuschauer sehen alles. |
| Kampf | Deterministisch: gleiche Züge führen immer zum gleichen Ergebnis. |
| Sieg | Wer den Heimatplaneten des Gegners erobert, gewinnt sofort. Sonst entscheiden nach Runde 120 Punkte aus Planeten und Ausbauten. |

So sähe eine Runde im Protokoll der Zuschauer-Ansicht aus:

```
Runde 47   Blau: 3/4 Aktionen        Rot: 3/3 Aktionen
  Blau  Flotte 12 Bomber  Vega → Altair   (Ankunft R49)
  Blau  Ausbau Festung auf Vega           (fertig R51)
  Blau  Aufklärung Sektor Nord
  Rot   Flotte 20 Jäger   Rigel → Altair  (Ankunft R48)
  Rot   Produktion Rigel: Jäger → Kreuzer
  Rot   Flotte 8 Kreuzer  Deneb → Rigel
```

## Zuschauer-Ansicht

Das Schlachtfeld bleibt die Hauptansicht und wird erweitert:

- Routen als Linien, Ausbauten als Zeichen am Planeten, Flotten mit ihrer Zusammensetzung.
- Die Sicht ist umschaltbar zwischen Blau, Rot und allem.
- Ein Rundenprotokoll nennt je Runde die Aktionen beider Seiten.
- Die Zeitleiste springt rundenweise.

## Werkzeug für die Bot-Entwicklung

- Ein lokaler Simulator mit den neuen Regeln.
- Zwei bis drei deutlich stärkere eingebaute Gegner zum Testen.
- Eine neue Bot-Vorlage und eine neue Regelbeschreibung in `docs/API.md`.

## Umsetzung

Die neue Engine ersetzt die alte. Arena, Fristen, Serien und Replay-Strom bleiben, nur die Spielerzustände werden wegen des Nebels je Sitz gefiltert. Gebaut wird in drei spielbaren Stufen:

1. Runden, Aktionslimit und Routen.
2. Ausbauten und Schiffstypen.
3. Nebel, stärkere eingebaute Bots und der Feinschliff der Ansicht.

## Verworfene Wege

- **Echtzeit mit gedrosselten Befehlen:** bleibt ein Rechenduell, der Spam wird nur gebremst.
- **Tiefe nur vor dem Match (Fraktionen, Doktrinen):** das einzelne Match sieht weiter hektisch aus.
- **Zweiter Spielmodus neben dem alten:** doppelte Pflege für ein Spiel, das zu simpel ist.

## Folgen

- Beide Bots müssen neu gebaut werden.
- Das alte Planet Wars entfällt, alte Replay-Dateien sind nicht mehr abspielbar.
- Zahlenwerte wie Kosten, Bauzeiten und Stärke der Konter stehen noch nicht fest. Sie werden im Design festgelegt und mit dem Simulator ausbalanciert.

## Zur Entscheidung

1. Zustimmung zum Regelkern.
2. Zustimmung, dass das alte Spiel ersetzt wird.

Nach der Zustimmung folgt das schriftliche Design zur Freigabe, danach der Bauplan.
