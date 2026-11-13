# Umgebungsprofil Agent-A

Stand: 2026-11-13, gemessen in der laufenden Sitzung.

## Rahmen

- Claude Code in einer verwalteten Cloud-Sitzung, isolierter Container, kurzlebig. Was nicht gepusht ist, geht mit der Sitzung verloren.
- Ubuntu 24.04, x86_64, 4 Kerne, 15 GB RAM, rund 30 GB freier Plattenplatz.
- Git-Schreibrecht: nur auf den eigenen Sitzungs-Branch (aktuell in `status/agent-a.json`). Kein Push auf `main` ohne Freigabe meines Menschen. Pull Requests nur auf dessen Anweisung.
- GitHub-Zugriff ist auf dieses eine Repository beschränkt.

## Laufzeiten und Werkzeuge

| Vorhanden | Version |
|---|---|
| Node.js / npm / pnpm / yarn / bun | 22.23 / 10.9 / 10.28 / 1.22 / 1.4 |
| Python / pip / uv | 3.13 / 24.0 / 0.11 |
| Go, Rust, Java, gcc, make | 1.24, 1.97, vorhanden |
| Chromium + Playwright | vorinstalliert, für UI-Prüfungen und Screenshots |
| Redis 7.0, PostgreSQL 16 | `redis-server` und Postgres-Binary im Image, lokal startbar, dazu `redis-cli` und `psql` |
| git, gh, gcloud, curl, jq | vorhanden |

Nicht vorhanden: Docker-Daemon (nur der Client), Deno, Vercel-CLI, flyctl, wrangler, aws, az.

## Netz

Ausgehend nur HTTPS über einen Proxy mit Positivliste. Stufe „eingeschränkt“: Paketquellen und GitHub ja, alles andere nein.

| Ziel | Ergebnis |
|---|---|
| github.com, api.github.com, raw.githubusercontent.com, ghcr.io | erreichbar |
| registry.npmjs.org, pypi.org, crates.io-Index, Go-Proxy, Ubuntu-Archiv, Docker Hub | erreichbar |
| vercel.com, api.vercel.com | **gesperrt (403)** |
| upstash.com, supabase.com, neon.tech | **gesperrt (403)** |
| fly.io, render.com, railway.app, api.cloudflare.com | **gesperrt (403)** |
| beliebige andere Hosts (example.com, google.com) | **gesperrt (403)** |

Folgen für die Arena:

- **Eingehend:** kein öffentlich erreichbarer Port. Ein Server, den ich hier starte, ist nur für mich unter `localhost` sichtbar. Agent-B kann ihn nicht erreichen.
- **Ausgehend zur Arena:** Einen gehosteten Match-Server kann ich nur ansprechen, wenn mein Mensch dessen Hostnamen in meiner Umgebung freigibt. Das ist pro exaktem Hostnamen möglich (keine Platzhalter), ich kann die Freigabe selbst beantragen.
- Nur HTTPS über den Proxy ist gesichert. Ob lange offene Verbindungen (SSE, WebSocket) den Proxy überstehen, ist ungetestet. Kurze REST-Aufrufe mit Long-Polling sind die sichere Annahme.

## Deployment-Ziele aus meiner Sicht

- Direkt deployen kann ich derzeit **nirgendwohin**: keine CLI, keine Zugangsdaten, Hosts gesperrt. Die Vercel-Anbindung meiner Sitzung ist konfiguriert, aber am Proxy gescheitert.
- Realistischer Weg: Hosting, das bei Push auf `main` selbst baut (Git-Anbindung), eingerichtet von einem der beiden Menschen.
- Datenbank: keine erreichbar. Der vorhandene Code sieht Upstash Redis über Umgebungsvariablen vor, sonst Arbeitsspeicher.

## Was ich gut übernehmen kann

Lokal bauen, testen (Vitest), UI im Headless-Browser prüfen und Screenshots liefern, Simulationen und Lasttests gegen einen lokalen Server.
