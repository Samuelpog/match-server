"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SeriesInfo } from "@/lib/arena/api-types";
import { abortSeries, ApiError, getSeries, sleep } from "@/lib/client/arena-api";
import { BotBriefing } from "./BotBriefing";
import { MatchView } from "./MatchView";
import { ArenaSkeleton, ConfirmButton, Notice, StatusChip } from "./ui";

type Stream =
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "error"; message: string }
  | { phase: "ready"; series: SeriesInfo; briefing: string; connection: "live" | "reconnecting" };

/** Hält den Stand einer Serie aktuell, mit einem wartenden Aufruf wie beim Match. */
function useSeries(id: string): Stream {
  const [state, setState] = useState<Stream>({ phase: "loading" });
  useEffect(() => {
    const abort = new AbortController();
    const { signal } = abort;
    (async () => {
      let version: number | undefined;
      let failures = 0;
      while (!signal.aborted) {
        try {
          const response = await getSeries(id, { since: version, waitSeconds: version === undefined ? 0 : 20, signal });
          if (signal.aborted) return;
          failures = 0;
          if (!response) {
            setState((now) => (now.phase === "ready" ? { ...now, connection: "live" } : now));
            continue;
          }
          version = response.series.version;
          setState({ phase: "ready", series: response.series, briefing: response.briefing, connection: "live" });
          if (response.series.status === "finished" || response.series.status === "aborted") return;
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof ApiError && error.status === 404) {
            setState({ phase: "missing" });
            return;
          }
          failures += 1;
          const message = error instanceof Error ? error.message : "Keine Verbindung zum Server.";
          setState((now) =>
            now.phase === "ready" ? { ...now, connection: "reconnecting" } : failures >= 3 ? { phase: "error", message } : now,
          );
          await sleep(Math.min(1000 * 2 ** failures, 10_000), signal);
        }
      }
    })();
    return () => abort.abort();
  }, [id]);
  return state;
}

function name(series: SeriesInfo, slot: 0 | 1): string {
  return series.players[slot].name ?? `Teilnehmer ${slot + 1}`;
}

function Scoreboard({ series }: { series: SeriesInfo }) {
  const needed = Math.ceil(series.bestOf / 2);
  const chip =
    series.status === "running" ? (
      <StatusChip tone="live">Live</StatusChip>
    ) : series.status === "waiting" ? (
      <StatusChip tone="wait">Wartet auf Bots</StatusChip>
    ) : (
      <StatusChip tone="done">{series.status === "aborted" ? "Abgebrochen" : "Beendet"}</StatusChip>
    );
  return (
    <section aria-label="Stand der Serie" className="flex flex-col items-center gap-1 border border-line bg-surface p-2">
      <div className="flex flex-wrap items-center justify-center gap-1">
        {chip}
        <span className="label">
          Best of {series.bestOf} · {needed} {needed === 1 ? "Sieg" : "Siege"} nötig
        </span>
      </div>
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2">
        <span className={`truncate text-right text-lg font-semibold text-p1 ${series.winner === 0 ? "underline underline-offset-4" : ""}`}>
          {name(series, 0)}
        </span>
        <span className="tabular text-xl leading-none font-semibold" aria-label={`${series.wins[0]} zu ${series.wins[1]}`}>
          {series.wins[0]} : {series.wins[1]}
        </span>
        <span className={`truncate text-lg font-semibold text-p2 ${series.winner === 1 ? "underline underline-offset-4" : ""}`}>
          {name(series, 1)}
        </span>
      </div>
      <p className="text-sm text-muted">
        {series.status === "finished"
          ? series.winner === null
            ? "Die Serie endet ohne Sieger."
            : `${name(series, series.winner)} gewinnt die Serie.`
          : series.status === "waiting"
            ? "Die Serie beginnt, sobald beide Bots beigetreten sind."
            : "Sitze und Karte wechseln von Spiel zu Spiel."}
        {series.draws > 0 ? ` ${series.draws} ${series.draws === 1 ? "Spiel" : "Spiele"} unentschieden.` : ""}
      </p>
    </section>
  );
}

function Games({
  series,
  shown,
  onSelect,
}: {
  series: SeriesInfo;
  shown: string | null;
  onSelect: (matchId: string) => void;
}) {
  if (series.games.length === 0) return null;
  return (
    <section aria-labelledby="spiele-titel" className="flex flex-col">
      <h2 id="spiele-titel" className="label pb-0.5">
        Spiele der Serie
      </h2>
      <ol className="flex flex-wrap gap-0.5">
        {series.games.map((game) => {
          const outcome =
            game.status === "running"
              ? "läuft"
              : game.status === "waiting"
                ? "wartet"
                : game.status === "aborted"
                  ? "abgebrochen"
                  : game.winner === null
                    ? "unentschieden"
                    : `Sieg ${name(series, game.winner)}`;
          return (
            <li key={game.matchId}>
              <button
                type="button"
                aria-pressed={shown === game.matchId}
                onClick={() => onSelect(game.matchId)}
                className={`flex min-h-6 flex-col items-start border px-1 py-0.5 text-left text-sm ${
                  shown === game.matchId ? "border-ink bg-raised" : "border-line hover:border-ink"
                }`}
              >
                <span className="font-semibold">Spiel {game.game}</span>
                <span className="text-xs text-muted">
                  Karte {game.game}, <span className={game.seats[0] === 0 ? "text-p1" : "text-p2"}>{name(series, game.seats[0])}</span>{" "}
                  beginnt auf Sitz 1 · {outcome}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Turnier-Ansicht: Stand der Serie, alle Spiele, darunter das laufende Spiel
 * live. Beginnt das nächste Spiel, wechselt die Ansicht von selbst dorthin,
 * solange man nicht von Hand ein älteres Spiel gewählt hat.
 */
export function SeriesView({ id }: { id: string }) {
  const stream = useSeries(id);
  const [pinned, setPinned] = useState<string | null>(null);

  if (stream.phase === "loading") return <ArenaSkeleton note="Serie wird geladen …" />;
  if (stream.phase === "missing") {
    return (
      <Notice title="Diese Serie kennt der Server nicht">
        Die Kennung <code className="font-mono">{id}</code> ist unbekannt, oder der Server wurde seit der Serie neu
        gestartet. Einzelne Spiele, die du bis zum Ende gesehen hast, liegen noch unter{" "}
        <Link href="/replay" className="underline underline-offset-2">
          Replays
        </Link>
        .
      </Notice>
    );
  }
  if (stream.phase === "error") {
    return <Notice title="Der Server ist nicht erreichbar">{stream.message} Die Seite versucht es von selbst weiter.</Notice>;
  }

  const { series, briefing, connection } = stream;
  const latest = series.current ?? series.games.at(-1)?.matchId ?? null;
  const shown = pinned && series.games.some((game) => game.matchId === pinned) ? pinned : latest;
  const shownGame = series.games.find((game) => game.matchId === shown);
  const open = series.players.some((player) => !player.joined);
  const over = series.status === "finished" || series.status === "aborted";

  return (
    <div className="flex flex-col gap-2">
      <header className="flex flex-wrap items-baseline gap-x-2">
        <h1 className="text-lg font-semibold">{series.label ?? "Serie"}</h1>
        <span className="text-sm text-muted">
          Serie <span className="font-mono">{series.id}</span>
        </span>
      </header>
      {connection === "reconnecting" ? (
        <p role="status" className="border border-warn bg-surface p-1 text-sm font-semibold text-warn">
          Verbindung unterbrochen. Zu sehen ist der letzte bekannte Stand, die Seite verbindet sich neu.
        </p>
      ) : null}

      <Scoreboard series={series} />
      {open && !over ? <BotBriefing text={briefing} scope="Serie" /> : null}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <Games series={series} shown={shown} onSelect={(matchId) => setPinned(matchId === latest ? null : matchId)} />
        {pinned && pinned !== latest ? (
          <button type="button" onClick={() => setPinned(null)} className="min-h-5 border border-line px-2 text-sm hover:border-ink">
            Zum aktuellen Spiel
          </button>
        ) : null}
      </div>

      {shown ? (
        // Sitzt Teilnehmer 2 in diesem Spiel auf Sitz 1, werden die Seiten getauscht: Teilnehmer 1 bleibt blau und links.
        <MatchView key={shown} id={shown} embedded flip={shownGame?.seats[0] === 1} />
      ) : (
        <p className="border border-line bg-surface p-2 text-sm text-muted">
          Noch kein Spiel. Das erste beginnt, sobald beide Bots der Serie beigetreten sind.
        </p>
      )}

      {over ? null : (
        <ConfirmButton
          label="Serie abbrechen"
          question="Die Serie und das laufende Spiel enden sofort. Wirklich abbrechen?"
          confirm="Ja, abbrechen"
          onConfirm={() => abortSeries(id)}
        />
      )}
    </div>
  );
}
