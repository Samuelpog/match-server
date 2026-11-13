# Umgebungsprofil Agent-A

Stand: 2026-11-13, gemessen in der laufenden Sitzung. Schreiber: Agent-A.

## Kurzfassung

- Flüchtiger Linux-Container, kein eingehender Zugriff von außen.
- Ausgehend nur HTTPS auf Port 443 über einen Policy-Proxy. Erreichbar sind GitHub und die Paket-Registries, fast alles andere wird mit 403 abgelehnt.
- Keine Zugangsdaten für Hosting oder Datenbanken vorhanden.
- Push nur auf den Branch `claude/funny-ramanujan-guacob`.

## Maschine

| | |
| --- | --- |
| System | Ubuntu 24.04, x86_64 |
| CPU / RAM | 4 Kerne, 15 GB |
| Platte | etwa 31 GB frei |
| Lebensdauer | Container wird nach Inaktivität verworfen. Nur was gepusht ist, bleibt. |

## Laufzeiten und Werkzeuge

| Vorhanden | Version |
| --- | --- |
| Node.js | 22.23.4 (npm 10.9.9, pnpm 10.28.0, yarn 1.22.22) |
| Bun | 1.4.4 |
| Python | 3.13.18 (pip, uv 0.11.32) |
| Go | 1.24.7 |
| Rust | 1.97.0 |
| Java, Ruby 3.3.6, PHP 8.3.6, gcc 13.3, make | vorhanden |
| Chromium + Playwright | 1.63.0, für Browser-Tests und Screenshots |
| Redis | `redis-server` und `redis-cli` 7.0 lokal startbar |
| PostgreSQL | 16 (Server-Binary und `psql`) lokal startbar |
| git, jq, nc | vorhanden |

Nicht vorhanden: laufender Docker-Daemon (nur die CLI), Deno, sqlite3, websocat, ssh, sowie die CLIs von Vercel, Fly, Wrangler, Netlify, AWS, Azure.

## Netzwerk

Ausgehende Verbindungen laufen über einen lokalen Proxy (`HTTPS_PROXY`), der TLS neu terminiert. Richtlinie der Umgebung: „limited", eigene Host-Freigaben bisher keine, Paket-Registries und MCP-Server sind erlaubt.

Erreichbar (getestet):

- `github.com`, `api.github.com`, `raw.githubusercontent.com`, `codeload.github.com`, `gist.github.com`
- `registry.npmjs.org`, `pypi.org`, `proxy.golang.org`, `crates.io`, `archive.ubuntu.com`, `nodejs.org`
- `ghcr.io`, `registry-1.docker.io` (antworten, mangels Docker-Daemon aber kaum nutzbar)
- `storage.googleapis.com`, `www.googleapis.com`, `fonts.googleapis.com`

Abgelehnt mit 403 am Proxy (getestet):

- Hosting: `vercel.com`, `api.vercel.com`, `*.vercel.app`, `fly.io`, `render.com`, `api.cloudflare.com`, `*.github.io`
- Daten: `upstash.com`, `api.upstash.com`, `supabase.com`
- CDNs und Sonstiges: `cdn.jsdelivr.net`, `unpkg.com`, `example.com`, `www.google.com`, `httpbin.org`

Grundsätzlich nicht möglich über den Proxy: unverschlüsseltes HTTP, andere Ports als 443, WebSocket-Upgrades, gRPC, rohe TCP-Verbindungen zu Datenbanken.

Eingehend: nichts. Ein lokal gestarteter Server ist nur für meinen Auftraggeber über die Vorschau seiner App sichtbar, nicht für Agent-B und nicht fürs Internet.

Erweiterbar: Mein Auftraggeber kann einzelne Hosts für die Umgebung freigeben (wirkt nach Sekunden) und Zugangsdaten hinterlegen, die der Proxy in Anfragen einsetzt. Ich schlage das erst vor, wenn ein konkreter Host feststeht.

## GitHub

- Zugriff nur auf `samuelpog/match-server`.
- Push nur auf `claude/funny-ramanujan-guacob`. Nicht auf `main` und nicht auf fremde Branches, solange mein Auftraggeber das nicht ausdrücklich erlaubt.
- Pull Requests lege ich nur an, wenn mein Auftraggeber es verlangt.
- Issues, Pull Requests und Kommentare kann ich lesen und schreiben. Kommentare schreibe ich ebenfalls nur auf Wunsch.

## Deployment-Ziele und Datenbanken

Stand jetzt: keine. Es gibt weder ein Vercel-Token noch Upstash-Werte, und die Variablen für AWS und Google Cloud enthalten nur Platzhalter des Proxys, keine echten Zugänge.

Das README auf `main` sieht Vercel mit Upstash Redis vor (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` oder `KV_REST_API_URL`, `KV_REST_API_TOKEN`). Von hier aus kann ich das weder ausrollen noch die ausgerollte Seite erreichen.

## Was das für die Arena heißt

1. Agent-A und Agent-B erreichen einander nie direkt. Gemeinsam ist nur GitHub.
2. Ein Live-Match zwischen zwei Bots in zwei Containern braucht einen Match-Server im Internet, dessen Host in **beiden** Umgebungen freigegeben ist.
3. Der Match-Server muss mit einfachem HTTPS-Polling auskommen. WebSockets gehen von hier aus nicht, die bestehende REST-Schnittstelle mit „Warten auf Änderungen" passt dazu.
4. Die Zuschauer-Ansicht läuft im Browser der Auftraggeber und unterliegt diesen Grenzen nicht.
5. Lokal entwickeln und testen kann ich vollständig: Node, Tests, Redis, Chromium.
