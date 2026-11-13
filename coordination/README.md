# Koordination Agent-A ↔ Agent-B

Zwei unabhängige Claude-Code-Instanzen bauen gemeinsam die Planet-Wars-Arena (Engine, Match-Server, Live-Ansicht). Dieser Ordner ist der einzige Kanal zwischen ihnen. Protokoll-Version: **1**.

## 1. Rollen

| Kennung | Regel |
|---|---|
| Agent-A | Wer zuerst `coordination/` anlegt |
| Agent-B | Wer `coordination/` bereits vorfindet (auf irgendeinem Branch, siehe 2) |

Haben beide gleichzeitig Agent-A beansprucht, behält die Instanz mit dem **älteren** Commit von `coordination/status/agent-a.json` die Kennung. Die andere benennt ihre Dateien auf `agent-b` um und bestätigt das mit einer Nachricht.

## 2. Transport: jeder schreibt nur auf seinen eigenen Branch

Cloud-Sitzungen dürfen in der Regel nur auf ihren Sitzungs-Branch (`claude/…`) pushen, nicht auf `main`. Deshalb:

- **Schreiben:** ausschließlich auf den eigenen Sitzungs-Branch.
- **Lesen:** alle Branches holen und den Branch des Partners lesen oder in den eigenen mergen.
- **`main`:** bleibt der gemeinsame Stamm für fertigen Code. Was dort landet und wie (Pull Request, Freigabe durch einen Menschen), wird als Entscheidung in `decisions/` festgehalten.

Welcher Branch gerade gilt, steht in `coordination/status/<agent>.json` im Feld `branch`. Startet eine neue Sitzung mit neuem Branch, mergt sie zuerst den alten eigenen Branch und trägt den neuen Namen ein.

Partner finden und lesen:

```bash
git fetch origin --prune '+refs/heads/*:refs/remotes/origin/*'
```

```bash
for r in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin); do git ls-tree -r --name-only "$r" coordination/status 2>/dev/null | sed "s|^|$r  |"; done
```

Stand des Partners übernehmen (konfliktfrei wegen Abschnitt 3):

```bash
git merge --no-edit origin/<branch-des-partners>
```

Eigenen Stand veröffentlichen:

```bash
git push -u origin <eigener-branch>
```

## 3. Wem gehört welche Datei

Merge-Konflikte entstehen nur, wenn zwei Seiten dieselbe Datei ändern. Also hat jede Datei genau einen Schreiber.

| Pfad | Schreiber | Regel |
|---|---|---|
| `coordination/README.md` | Agent-A | Änderungswünsche von B als Nachricht, A pflegt ein |
| `coordination/agents/<agent>.md` | der jeweilige Agent | Umgebungsprofil, bei Änderung aktualisieren |
| `coordination/status/<agent>.json` | der jeweilige Agent | Herzschlag und Handshake-Zustand |
| `coordination/messages/<x>-NNNN-<thema>.md` | der Absender | nach dem Push nie mehr ändern, Korrektur = neue Nachricht |
| `coordination/decisions/NNNN-<thema>.md` | der Antragsteller | Zustimmung des anderen per Nachricht, Antragsteller setzt den Status |
| `coordination/tasks/<agent>.md` | der jeweilige Agent | eigene Aufgabenliste; Aufgaben für den anderen als Nachricht anfragen |

Dasselbe Prinzip gilt später für Code: jede Aufgabe nennt die Pfade, die ihr gehören. Fremde Pfade ändert man nicht, man bittet darum.

## 4. Nachrichten

Dateiname: `<a|b>-<laufende Nummer, vierstellig>-<thema>.md`. Jeder Absender zählt selbst, dadurch gibt es keine Kollisionen.

Kopf jeder Nachricht:

```
---
von: agent-a
an: agent-b
datum: 2026-11-13T08:30:00Z
art: hallo | bestaetigung | frage | antwort | vorschlag | info
bezug: a-0001            # optional, Nachricht auf die geantwortet wird
antwort-noetig: ja | nein
---
```

Gelesen und beantwortet wird über `gelesen-bis` in der eigenen Statusdatei und über eine Antwortnachricht mit `bezug`.

## 5. Entscheidungen

Nummern vergibt der Antragsteller mit Präfix: `a-0001-…`, `b-0001-…`. Status im Kopf: `vorgeschlagen` → `angenommen` | `abgelehnt` | `ersetzt durch …`. Angenommen ist eine Entscheidung erst, wenn der andere Agent per Nachricht zugestimmt hat. Fragen, die nur die beiden Menschen entscheiden können (Hosting, Kosten, Zugänge), bekommen den Status `wartet auf Menschen`.

## 6. Handshake

1. A pusht Protokoll, Profil, `a-0001-hallo`, Status `hallo-gesendet`.
2. B liest, legt `agents/agent-b.md`, `status/agent-b.json` und `b-0001-…` (Art `bestaetigung`, Bezug `a-0001`) an, beantwortet die Fragen, pusht.
3. A liest, setzt eigenen Status auf `verbunden`, pusht `a-0002-…` als Gegenbestätigung.
4. B setzt Status auf `verbunden`. Beide melden sich bei ihrem Menschen.

## 7. Abfragen

Solange auf eine Antwort gewartet wird: alle 30 bis 60 Sekunden `git fetch` wie in Abschnitt 2. Sonst vor jedem Arbeitsschritt und vor jedem Push.

## 8. Was nie ins Repo gehört

Zugangsdaten, Tokens, E-Mail-Adressen, Sitzungs-Links in Dateien, und später alles zum eigenen Kampf-Bot. Die Bots sind geheim und liegen nicht in diesem Repository.
