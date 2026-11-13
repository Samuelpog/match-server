"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { HealthResponse, MatchInfo, MatchOptions, PlayerSpec, SeriesInfo } from "@/lib/arena/api-types";
import {
  ApiError,
  createMatch,
  createSeries,
  fetchHealth,
  getArenaKey,
  listMatches,
  listSeries,
  setArenaKey,
  sleep,
} from "@/lib/client/arena-api";
import { listReplays, type ReplaySummary } from "@/lib/client/replay-store";
import { StatusChip } from "./ui";

type Server =
  | { phase: "connecting"; slow: boolean }
  | { phase: "ready"; health: HealthResponse };

/** Fragt den Server, bis er antwortet. Ein schlafender Server braucht bis zu einer Minute. */
function useServer(): Server {
  const [server, setServer] = useState<Server>({ phase: "connecting", slow: false });
  useEffect(() => {
    const abort = new AbortController();
    const slow = setTimeout(() => setServer((now) => (now.phase === "connecting" ? { ...now, slow: true } : now)), 3000);
    (async () => {
      while (!abort.signal.aborted) {
        try {
          const health = await fetchHealth(abort.signal);
          if (!abort.signal.aborted) setServer({ phase: "ready", health });
          return;
        } catch {
          await sleep(3000, abort.signal);
        }
      }
    })();
    return () => {
      clearTimeout(slow);
      abort.abort();
    };
  }, []);
  return server;
}

interface Listing {
  matches: MatchInfo[];
  series: SeriesInfo[];
  /** Kann der Server Serien? `false`, solange der Endpunkt fehlt. */
  seriesSupported: boolean;
}

/** Matches und Serien des Servers, alle paar Sekunden aufgefrischt, solange die Seite sichtbar ist. */
function useListing(enabled: boolean): Listing | null {
  const [listing, setListing] = useState<Listing | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    (async () => {
      // Fehlt der Endpunkt für Serien, wird nicht bei jedem Durchlauf wieder danach gefragt.
      let seriesSupported = true;
      while (!abort.signal.aborted) {
        if (document.visibilityState === "visible") {
          try {
            const matches = await listMatches(abort.signal);
            let series: SeriesInfo[] = [];
            if (seriesSupported) {
              try {
                series = await listSeries(abort.signal);
              } catch (error) {
                if (error instanceof ApiError && error.status === 404) seriesSupported = false;
                else throw error;
              }
            }
            if (!abort.signal.aborted) setListing({ matches, series, seriesSupported });
          } catch {
            // Beim nächsten Durchlauf noch einmal. Die alte Liste bleibt stehen.
          }
        }
        await sleep(8000, abort.signal);
      }
    })();
    return () => abort.abort();
  }, [enabled]);
  return listing;
}

type Mode = "match" | "bo3" | "bo5";
const OPEN = "open";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "match", label: "Einzelnes Match", hint: "Ein Spiel, danach ist Schluss." },
  { id: "bo3", label: "Best of 3", hint: "Wer zuerst zwei Spiele gewinnt. Sitze und Karte wechseln je Spiel." },
  { id: "bo5", label: "Best of 5", hint: "Wer zuerst drei Spiele gewinnt. Sitze und Karte wechseln je Spiel." },
];

const FIELD = "h-5 w-full min-w-0 border border-line bg-space px-1";

function NumberField({
  label,
  hint,
  value,
  onChange,
  range,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  range: [number, number] | undefined;
  placeholder: string;
}) {
  const id = `feld-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={range?.[0]}
        max={range?.[1]}
        placeholder={placeholder}
        aria-describedby={`${id}-hinweis`}
        className={`${FIELD} tabular`}
      />
      <span id={`${id}-hinweis`} className="text-xs text-muted">
        {hint}
        {range ? ` ${range[0]} bis ${range[1]}.` : ""}
      </span>
    </div>
  );
}

function explain(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return "Der Server verlangt den Arena-Schlüssel, oder der eingetragene stimmt nicht.";
    }
    if (error.status === 404) return "Das kann dieser Stand des Servers noch nicht.";
    return error.message;
  }
  return "Der Server ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.";
}

function CreatePanel({ health, seriesSupported }: { health: HealthResponse; seriesSupported: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("match");
  const [players, setPlayers] = useState<[string, string]>([OPEN, OPEN]);
  const [label, setLabel] = useState("");
  const [options, setOptions] = useState({ seed: "", planets: "", tickLimit: "", tickMs: "", timeoutMs: "" });
  const [key, setKey] = useState(() => getArenaKey());
  const [busy, setBusy] = useState<"create" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (name: keyof typeof options) => (value: string) => setOptions((now) => ({ ...now, [name]: value }));
  const external = players.filter((player) => player === OPEN).length;

  function chosenOptions(): Partial<MatchOptions> {
    const result: Partial<MatchOptions> = {};
    for (const name of Object.keys(options) as (keyof typeof options)[]) {
      const text = options[name].trim();
      if (text !== "" && Number.isFinite(Number(text))) result[name] = Math.round(Number(text));
    }
    return result;
  }

  async function submit(kind: "create" | "demo") {
    setBusy(kind);
    setError(null);
    setArenaKey(key.trim());
    try {
      if (kind === "demo") {
        const { match } = await createMatch({ demo: true, label: "Demo", options: chosenOptions() });
        router.push(`/m/${match.id}`);
        return;
      }
      const specs = players.map(
        (player): PlayerSpec => (player === OPEN ? { type: "open" } : { type: "bot", bot: player }),
      ) as [PlayerSpec, PlayerSpec];
      const body = { players: specs, options: chosenOptions(), label: label.trim() || undefined };
      if (mode === "match") {
        const { match } = await createMatch(body);
        router.push(`/m/${match.id}`);
      } else {
        const { series } = await createSeries({ ...body, bestOf: mode === "bo3" ? 3 : 5 });
        router.push(`/s/${series.id}`);
      }
    } catch (cause) {
      setError(explain(cause));
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="neu-titel" className="flex flex-col gap-2 border border-line bg-surface p-2">
      <h2 id="neu-titel" className="text-lg font-semibold">
        Neues Match
      </h2>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit("create");
        }}
      >
        <fieldset className="flex flex-col gap-0.5">
          <legend className="label mb-0.5">Format</legend>
          <div className="grid grid-cols-3 gap-0.5">
            {MODES.map((entry) => {
              const disabled = entry.id !== "match" && !seriesSupported;
              return (
                <label
                  key={entry.id}
                  className={`flex min-h-6 cursor-pointer items-center justify-center border px-0.5 text-center text-sm has-focus-visible:outline-2 has-focus-visible:outline-ink ${
                    mode === entry.id ? "border-ink bg-raised font-semibold" : "border-line hover:border-ink"
                  } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={entry.id}
                    checked={mode === entry.id}
                    disabled={disabled}
                    onChange={() => setMode(entry.id)}
                    className="sr-only"
                  />
                  {entry.label}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            {MODES.find((entry) => entry.id === mode)?.hint}
            {seriesSupported ? "" : " Serien kann dieser Stand des Servers noch nicht."}
          </p>
        </fieldset>

        <div className="grid grid-cols-2 gap-1">
          {([0, 1] as const).map((seat) => (
            <div key={seat} className="flex flex-col">
              <label htmlFor={`spieler-${seat}`} className={`label ${seat === 0 ? "text-p1" : "text-p2"}`}>
                Spieler {seat + 1}
              </label>
              <select
                id={`spieler-${seat}`}
                value={players[seat]}
                onChange={(event) =>
                  setPlayers(seat === 0 ? [event.target.value, players[1]] : [players[0], event.target.value])
                }
                className={FIELD}
              >
                <option value={OPEN}>Externer Bot (offener Platz)</option>
                {health.bots.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    Eingebaut: {bot.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <p className="col-span-2 text-xs text-muted">
            {external === 0
              ? "Zwei eingebaute Bots: das Match startet sofort."
              : `${external === 2 ? "Beide Plätze sind" : "Ein Platz ist"} offen. Nach dem Anlegen zeigt die Seite die Verbindungsdaten, die ${
                  external === 2 ? "die Bots brauchen" : "der Bot braucht"
                }.`}
          </p>
        </div>

        <div className="flex flex-col">
          <label htmlFor="bezeichnung" className="label">
            Bezeichnung (optional)
          </label>
          <input
            id="bezeichnung"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={60}
            autoComplete="off"
            placeholder="z. B. Finale Freitag"
            className={FIELD}
          />
        </div>

        <details className="border border-line">
          <summary className="flex min-h-5 cursor-pointer items-center px-1 text-sm hover:bg-raised">
            Karte, Länge und Takt einstellen
          </summary>
          <div className="grid grid-cols-2 gap-1 p-1">
            <NumberField
              label="Karten-Seed"
              hint="Gleicher Seed, gleiche Karte. Leer: Zufall."
              value={options.seed}
              onChange={set("seed")}
              range={undefined}
              placeholder="Zufall"
            />
            <NumberField
              label="Planeten"
              hint="Anzahl."
              value={options.planets}
              onChange={set("planets")}
              range={health.limits.planets}
              placeholder={String(health.defaults.planets)}
            />
            <NumberField
              label="Tick-Limit"
              hint="Danach entscheidet die Wertung."
              value={options.tickLimit}
              onChange={set("tickLimit")}
              range={health.limits.tickLimit}
              placeholder={String(health.defaults.tickLimit)}
            />
            <NumberField
              label="Tick-Dauer (ms)"
              hint="Mindestdauer eines Ticks."
              value={options.tickMs}
              onChange={set("tickMs")}
              range={health.limits.tickMs}
              placeholder={String(health.defaults.tickMs)}
            />
            <NumberField
              label="Frist je Tick (ms)"
              hint="Wer später liefert, setzt aus."
              value={options.timeoutMs}
              onChange={set("timeoutMs")}
              range={health.limits.timeoutMs}
              placeholder={String(health.defaults.timeoutMs)}
            />
          </div>
        </details>

        {health.arenaKeyRequired ? (
          <div className="flex flex-col">
            <label htmlFor="arena-key" className="label">
              Arena-Schlüssel
            </label>
            <input
              id="arena-key"
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              autoComplete="off"
              required
              aria-describedby="arena-key-hinweis"
              className={`${FIELD} font-mono`}
            />
            <span id="arena-key-hinweis" className="text-xs text-muted">
              Der Server lässt nur anlegen, wer den Schlüssel kennt. Er bleibt in diesem Browser.
            </span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy !== null}
          className="min-h-6 bg-accent px-2 font-semibold text-on-accent disabled:opacity-60"
        >
          {busy === "create" ? "Wird angelegt …" : mode === "match" ? "Match anlegen" : "Serie anlegen"}
        </button>
      </form>

      <div className="flex flex-col gap-1 border-t border-line pt-2">
        <button
          type="button"
          onClick={() => submit("demo")}
          disabled={busy !== null}
          className="min-h-6 border border-ink px-2 font-semibold hover:bg-raised disabled:opacity-60"
        >
          {busy === "demo" ? "Demo startet …" : "Demo-Match starten"}
        </button>
        <p className="text-xs text-muted">
          Zwei eingebaute Bots spielen sofort gegeneinander. Zum Vorführen der Arena, ohne dass ein Bot von außen
          beitreten muss.
        </p>
      </div>

      {error ? (
        <p role="alert" className="border border-danger p-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function matchChip(match: MatchInfo) {
  if (match.status === "running") return <StatusChip tone="live">Live</StatusChip>;
  if (match.status === "waiting") return <StatusChip tone="wait">Wartet</StatusChip>;
  if (match.status === "aborted") return <StatusChip tone="done">Abgebrochen</StatusChip>;
  return <StatusChip tone="done">Beendet</StatusChip>;
}

function Names({ names, winner }: { names: [string | null, string | null]; winner: 0 | 1 | null }) {
  return (
    <span className="min-w-0 truncate">
      <span className={`text-p1 ${winner === 0 ? "font-semibold underline underline-offset-2" : ""}`}>
        {names[0] ?? "offen"}
      </span>
      <span className="text-muted"> gegen </span>
      <span className={`text-p2 ${winner === 1 ? "font-semibold underline underline-offset-2" : ""}`}>
        {names[1] ?? "offen"}
      </span>
    </span>
  );
}

const ROW =
  "grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-x-1 border-t border-line px-1 py-0.5 text-sm hover:bg-raised";

function ServerLists({ listing }: { listing: Listing | null }) {
  if (!listing) return <p className="text-sm text-muted">Liste wird geladen …</p>;
  const singles = listing.matches.filter((match) => match.series === null);
  return (
    <div className="flex flex-col gap-3">
      {listing.series.length > 0 ? (
        <section aria-labelledby="serien-titel" className="flex flex-col">
          <h2 id="serien-titel" className="label pb-0.5">
            Serien
          </h2>
          <ul>
            {listing.series.map((series) => (
              <li key={series.id}>
                <Link href={`/s/${series.id}`} className={ROW}>
                  {series.status === "running" ? (
                    <StatusChip tone="live">Live</StatusChip>
                  ) : series.status === "waiting" ? (
                    <StatusChip tone="wait">Wartet</StatusChip>
                  ) : (
                    <StatusChip tone="done">{series.status === "aborted" ? "Abgebrochen" : "Beendet"}</StatusChip>
                  )}
                  <Names names={[series.players[0].name, series.players[1].name]} winner={series.winner} />
                  <span className="tabular text-muted">
                    {series.wins[0]} : {series.wins[1]} · Best of {series.bestOf}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="matches-titel" className="flex flex-col">
        <h2 id="matches-titel" className="label pb-0.5">
          Einzelne Matches
        </h2>
        {singles.length === 0 ? (
          <p className="border-t border-line px-1 py-1 text-sm text-muted">
            Der Server kennt gerade kein Match. Leg rechts eines an oder starte die Demo.
          </p>
        ) : (
          <ul>
            {singles.map((match) => (
              <li key={match.id}>
                <Link href={`/m/${match.id}`} className={ROW}>
                  {matchChip(match)}
                  <Names names={[match.players[0].name, match.players[1].name]} winner={match.result?.winner ?? null} />
                  <span className="tabular text-muted">
                    {match.label ? `${match.label} · ` : ""}Tick {match.tick}/{match.tickLimit}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LocalReplays() {
  const [replays, setReplays] = useState<ReplaySummary[] | null>(null);
  useEffect(() => {
    let alive = true;
    listReplays()
      .then((list) => alive && setReplays(list))
      .catch(() => alive && setReplays([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section aria-labelledby="lokal-titel" className="flex flex-col">
      <div className="flex items-baseline justify-between gap-1 pb-0.5">
        <h2 id="lokal-titel" className="label">
          In diesem Browser gespeichert
        </h2>
        <Link href="/replay" className="text-sm underline underline-offset-2 hover:text-ink">
          Alle Replays, Datei laden
        </Link>
      </div>
      {replays === null ? null : replays.length === 0 ? (
        <p className="border-t border-line px-1 py-1 text-sm text-muted">
          Noch nichts. Jedes Match, das du bis zum Ende ansiehst, wird hier abgelegt und bleibt abspielbar, auch wenn
          der Server es vergessen hat.
        </p>
      ) : (
        <ul>
          {replays.slice(0, 5).map((replay) => (
            <li key={replay.id}>
              <Link href={`/replay?id=${encodeURIComponent(replay.id)}`} className={ROW}>
                <StatusChip tone="done">Replay</StatusChip>
                <Names names={replay.names} winner={replay.winner} />
                <span className="tabular text-muted">{replay.ticks} Ticks</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Lobby() {
  const router = useRouter();
  const server = useServer();
  const listing = useListing(server.phase === "ready");
  const [openId, setOpenId] = useState("");

  function open(event: React.FormEvent) {
    event.preventDefault();
    const id = openId.trim();
    if (id) router.push(`/m/${encodeURIComponent(id)}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex max-w-[720px] flex-col gap-0.5">
        <span className="label">Kommandozentrale</span>
        <h1 className="text-xl font-semibold">Planet Wars Arena</h1>
        <p className="text-muted">
          Zwei Bots kämpfen um ein Planetensystem. Hier legst du Matches und Serien an und schaust live zu.
        </p>
      </header>

      {server.phase === "connecting" ? (
        <p role="status" className="max-w-[720px] border border-warn bg-surface p-1.5 text-sm text-warn">
          {server.slow
            ? "Der Server wacht gerade auf. Nach einer Pause von 15 Minuten dauert das bis zu einer Minute. Die Seite wartet von selbst."
            : "Verbindung zum Server wird aufgebaut …"}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          {server.phase === "ready" ? <ServerLists listing={listing} /> : null}
          <LocalReplays />

          <form onSubmit={open} className="flex flex-col">
            <label htmlFor="open-id" className="label pb-0.5">
              Match mit Kennung öffnen
            </label>
            <div className="flex gap-0.5">
              <input
                id="open-id"
                value={openId}
                onChange={(event) => setOpenId(event.target.value)}
                placeholder="Kennung des Matches"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="h-6 min-w-0 flex-1 border border-line bg-space px-1 font-mono"
              />
              <button type="submit" className="h-6 border border-line px-2 font-semibold hover:border-ink">
                Öffnen
              </button>
            </div>
          </form>

          {server.phase === "ready" ? (
            <p className="text-xs text-muted">
              Server läuft seit {new Date(server.health.startedAt).toLocaleString("de-DE")}
              {server.health.commit ? `, Stand ${server.health.commit.slice(0, 7)}` : ""}. {server.health.running} von{" "}
              {server.health.limits.maxRunningMatches} möglichen Matches laufen. Der Server hält Matches nur im
              Arbeitsspeicher: nach 15 Minuten ohne Aufruf schläft er ein und vergisst sie.
            </p>
          ) : null}
        </div>

        <div className="order-1 lg:order-2">
          {server.phase === "ready" ? (
            <CreatePanel health={server.health} seriesSupported={listing?.seriesSupported ?? true} />
          ) : (
            <div className="flex min-h-20 items-center justify-center border border-line bg-surface p-2 text-center text-sm text-muted">
              Anlegen geht, sobald der Server antwortet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
