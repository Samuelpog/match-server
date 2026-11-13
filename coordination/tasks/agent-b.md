# Aufgaben Agent-B

Bereich laut Pflichtenheft: Live-Ansicht, Animation, Lobby- und Turnier-Steuerung, Replay-Player.
Pfade: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/m/**`, weitere Seiten, `src/app/globals.css`, `src/components/**`, `src/lib/client/**`, `src/lib/viewer/**`.

| Nr. | Aufgabe | Status |
|---|---|---|
| B1–B2 | Handshake | erledigt |
| B5 | Schnittstelle zum Server (`decisions/b-0001`, `a-0002`) | abgestimmt |
| B6 | Anzeige-Modell, Abspielkopf, Ableitung von Kämpfen und Statistik (`src/lib/viewer`) | erledigt |
| B7 | Schlachtfeld auf Canvas: Sterne, Planeten, Flotten, Effekte | erledigt |
| B8 | Telemetrie: Kräfteverhältnis, Match-Status, Sieger-Auswertung | erledigt |
| B9 | Zeitleiste und Replay-Steuerung, Replay speichern und laden | erledigt |
| B10 | Lobby: Match, Serie, Demo, Verbindungsdaten | erledigt |
| B11 | Adapter auf das Format von Agent-A, Test gegen lokalen Server | erledigt |
| B12 | Serien-Seite gegen M3 testen | erledigt |
| B13 | Test gegen Render im Browser | erledigt, Aufwachen aus dem Schlafmodus misst Agent-A |

## Rundenstrategie (`decisions/a-0003`, `a-0004`)

Das alte Spiel wird ersetzt. Gebaut wird je Stufe gegen die Typen und die Beispiel-Datei von Agent-A.

### Stufe 1

| Nr. | Aufgabe | Status |
|---|---|---|
| B20 | Anzeige-Modell und Adapter für `version: 2` (Runden, Routen, Flottenliste je Frame, Aktionen, Ereignisse mit Schritt, `params`) | erledigt |
| B21 | Puffer und Abspielkopf: Runde in Schritten (Befehle, Bewegung, Kampf, Ergebnis), festes Schautempo im Replay, Aufholen bei schnellen Frames | erledigt |
| B22 | Schlachtfeld: Routen, Namen, Heimat- und Knotenplaneten, Flotten entlang der Route, Kampf auf der Route, Ausfall vor dem Planeten | erledigt |
| B23 | Rundenprotokoll statt Ereignisliste, mit abgelehnten Aktionen, Klick springt zur Runde | erledigt |
| B24 | Stand: Kräfte-Anzeige nach Punkten, Aktionszähler, Produktion, Zeitleiste in Runden | erledigt |
| B25 | Lobby: Voreinstellungen „Turnier" und „Test", Optionen `planets`, `rounds`, `roundMs`, `timeoutMs` | erledigt |
| B26 | `/vorschau` mit `src/lib/game` im Browser | erledigt |
| B27 | Alte Replays: klare Meldung, Ablage im Browser räumen | erledigt |
| B28 | Umstellung auf die neuen Typen, Test gegen lokalen Server und im Browser | erledigt, Test gegen Render steht aus |

### Später

| Stufe | Aufgabe | Status |
|---|---|---|
| 2 | Zeichen für Ausbau und Baufortschritt, fließende Nachschublinien, Verteidigungsstärke am Planeten | offen |
| 3 | Formen der Schiffstypen, Bestände je Typ (nach Freigabe) | offen |
| 4 | Umschaltbare Sicht, Aufklärung in der Ansicht (nach Freigabe) | offen |
| 5 | Feinschliff | offen |

