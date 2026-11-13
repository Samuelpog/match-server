# Umgebungsprofil Agent-B

Stand: 2026-11-13, gemessen in der laufenden Sitzung.

## Kurzfassung

Meine Umgebung ist praktisch dieselbe wie die von Agent-A: flüchtiger Container, ausgehend nur HTTPS an GitHub und Paketquellen, nichts eingehend, keine Zugangsdaten für Hosting oder Datenbanken.

## Rahmen

- Claude Code in einer verwalteten Cloud-Sitzung, isolierter Container, kurzlebig. Nur was gepusht ist, bleibt.
- Ubuntu 24.04, x86_64, 4 Kerne, 15 GB RAM, etwa 31 GB freier Plattenplatz.
- Git-Schreibrecht: nur auf den eigenen Sitzungs-Branch (steht in `status/agent-b.json`). Kein Push auf `main` und auf fremde Branches ohne ausdrückliche Freigabe meines Menschen. Pull Requests nur auf dessen Anweisung.
- GitHub-Zugriff ist auf dieses eine Repository beschränkt. Issues, Pull Requests und Kommentare kann ich lesen und schreiben, Kommentare schreibe ich nur auf Wunsch meines Menschen.

## Laufzeiten und Werkzeuge

| Vorhanden | Version |
|---|---|
| Node.js / npm / pnpm / yarn / bun | 22.23.4 / 10.9.9 / 10.28.0 / 1.22.22 / 1.4.4 |
| Python / pip / uv | 3.13.18 / 24.0 / 0.11.32 |
| Go / Rust | 1.24.7 / 1.97.0 |
| Java, Ruby 3.3.6, PHP 8.3.6, gcc 13.3, make | vorhanden |
| Chromium + Playwright | 1.63.0, für UI-Prüfungen und Screenshots |
| Redis | `redis-server` und `redis-cli` 7.0, lokal startbar |
| PostgreSQL | 16, Server-Binary unter `/usr/lib/postgresql/16/bin` und `psql`, lokal startbar |
| git, gh, gcloud, curl, jq, nc | vorhanden |

Nicht vorhanden: Docker-Daemon (nur der Client), Deno, sqlite3, websocat, ssh, Vercel-CLI, flyctl, wrangler, netlify, aws, az.

Hinweis für Agent-A: `redis-server` und das Postgres-Binary liegen bei mir im Image. Vermutlich auch bei dir, dann können wir den Redis-Speicher lokal gegen einen echten Redis testen.

## Netz

Ausgehend nur HTTPS auf Port 443 über einen Proxy mit Positivliste, der TLS neu terminiert. Stufe „eingeschränkt": eigene Umgebung für dieses Repository mit genau einer Host-Freigabe (der Match-Server bei Render), dazu Paketquellen und MCP-Server.

| Ziel | Ergebnis |
|---|---|
| github.com, api.github.com, raw.githubusercontent.com, codeload.github.com, gist.github.com | erreichbar |
| registry.npmjs.org, pypi.org, proxy.golang.org, crates.io, archive.ubuntu.com, nodejs.org | erreichbar |
| ghcr.io, registry-1.docker.io | erreichbar (ohne Docker-Daemon kaum nutzbar) |
| storage.googleapis.com, www.googleapis.com, fonts.googleapis.com | erreichbar |
| match-server-81dg.onrender.com | erreichbar (seit 2026-11-13 freigegeben), Long-Polling mit 25 s getestet |
| vercel.com, api.vercel.com, `*.vercel.app` | **gesperrt (403)** |
| upstash.com, api.upstash.com, supabase.com | **gesperrt (403)** |
| fly.io, render.com, api.cloudflare.com, `*.github.io` | **gesperrt (403)** |
| cdn.jsdelivr.net, unpkg.com | **gesperrt (403)** |
| beliebige andere Hosts (example.com, www.google.com, httpbin.org) | **gesperrt (403)** |

Weitere Grenzen:

- **Eingehend:** kein öffentlich erreichbarer Port. Ein lokaler Server ist nur für mich und über die App-Vorschau für meinen Menschen sichtbar.
- **Lange Verbindungen:** WebSocket-Upgrades, gRPC, unverschlüsseltes HTTP, andere Ports als 443 und rohe TCP-Verbindungen zu Datenbanken nennt die Proxy-Dokumentation ausdrücklich als nicht unterstützt. SSE ist ungetestet. Kurze REST-Aufrufe mit Long-Polling sind die sichere Annahme, der Proxy kann eine Verbindung bis etwa eine Minute halten.
- **Freigaben:** Mein Mensch kann einzelne Hosts mit exaktem Namen freigeben, das wirkt nach Sekunden. Ich kann die Freigabe beantragen, sobald ein konkreter Hostname feststeht. Zugangsdaten für einen Host kann er so hinterlegen, dass der Proxy sie einsetzt, ohne dass ich den Wert sehe.

## Deployment-Ziele und Datenbanken

- Direkt deployen kann ich **nirgendwohin**: keine CLI, keine Zugangsdaten, Hosts gesperrt. Eine Vercel-Anbindung hat meine Sitzung nicht. Die Variablen für AWS und Google Cloud in meiner Umgebung sind Platzhalter des Proxys, keine echten Zugänge.
- Datenbank: keine erreichbar. Lokal Redis und Postgres für Tests.
- Ob mein Mensch selbst ein Konto bei Vercel, Upstash oder einem anderen Anbieter hat, weiß ich noch nicht. Ich frage ihn.

## Was ich gut übernehmen kann

Lokal bauen und testen (Vitest), UI im Headless-Browser prüfen und Screenshots liefern, Simulationen und Lasttests gegen einen lokalen Server, Redis-Speicher gegen lokalen Redis prüfen.
