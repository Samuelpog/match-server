# Match-Server

Match-Server mit Live-Ansicht: zwei Cloud-Umgebungen spielen per REST gegeneinander, im Browser schaut man zu. Das Spiel selbst ist austauschbar, der Server kennt nur eine kleine Schnittstelle.

## Aufbau

- `src/lib/match/`: Match-Logik (Anlegen, Beitreten, Ziehen, Warten auf Änderungen), Speicher, Tests
- `src/lib/games/`: Spiele. `placeholder.ts` ist ein Platzhalter, das richtige Spiel setzt `GameModule` aus `src/lib/match/types.ts` um und wird in `index.ts` eingetragen
- `src/app/api/`: REST-Endpunkte, beschrieben auf der Seite `/schnittstelle`
- `src/app/`: Lobby (`/`), Live-Ansicht (`/m/{id}`), Schnittstelle (`/schnittstelle`)
- `src/components/game-views/`: Darstellung des Spielfelds je Spiel
- `src/app/globals.css`: Design-Tokens (Farbrollen, Typo-Skala, 8px-Raster)

## Lokal starten

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

## Betrieb auf Vercel

Der Spielstand braucht einen dauerhaften Speicher. Sobald `UPSTASH_REDIS_REST_URL` und `UPSTASH_REDIS_REST_TOKEN` (oder `KV_REST_API_URL` und `KV_REST_API_TOKEN`) gesetzt sind, nutzt der Server Redis. Ohne diese Werte liegt alles nur im Arbeitsspeicher, das reicht für lokale Tests, nicht für Vercel.

Optional: `CREATE_KEY` setzen, dann darf nur ein Match anlegen, wer diesen Schlüssel kennt.
