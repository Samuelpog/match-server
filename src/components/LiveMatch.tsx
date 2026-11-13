"use client";

import Link from "next/link";
import { useEffect } from "react";
import { rememberMatch } from "@/lib/client/recent";
import { useMatch } from "@/lib/client/use-match";
import type { MatchView, SeatView } from "@/lib/match/types";
import { GameView } from "./game-views";
import { JoinBriefing } from "./JoinBriefing";

const STATUS_LABEL: Record<MatchView["status"], string> = {
  waiting: "Wartet auf Spieler",
  running: "Läuft",
  finished: "Beendet",
};

export function MatchSkeleton() {
  return (
    <div role="status" aria-label="Match wird geladen" className="flex animate-pulse flex-col gap-4">
      <div className="h-6 w-1/2 bg-line" />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="h-12 bg-line" />
        <div className="h-12 bg-line" />
      </div>
      <div className="h-32 bg-line" />
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 border border-line bg-surface p-3">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="text-muted">{children}</div>
      <Link href="/" className="flex min-h-6 items-center bg-accent px-3 font-semibold text-on-accent">
        Zur Lobby
      </Link>
    </div>
  );
}

function SeatPanel({ seat, match }: { seat: SeatView; match: MatchView }) {
  const onTurn = match.status === "running" && (match.turn === null || match.turn === seat.seat);
  const won = match.result?.winner === seat.seat;
  return (
    <li className="flex flex-col gap-1 border border-line bg-surface p-2 sm:p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs tracking-wide text-muted uppercase">Sitzplatz {seat.seat + 1}</span>
        {seat.joined ? (
          <span className={`text-xs font-semibold ${seat.online ? "text-ok" : "text-warn"}`}>
            {seat.online ? "Verbunden" : "Meldet sich nicht"}
          </span>
        ) : null}
      </div>
      <div className="text-lg font-semibold">{seat.name ?? "Noch frei"}</div>
      <div className="min-h-3 text-sm text-muted">
        {won ? "Gewinner" : onTurn ? "Am Zug" : seat.joined ? "Wartet" : "Wartet auf Beitritt"}
      </div>
    </li>
  );
}

function MoveLog({ match }: { match: MatchView }) {
  if (match.log.length === 0) {
    return <p className="text-sm text-muted">Noch keine Züge. Der erste erscheint hier, sobald er gesendet wurde.</p>;
  }
  return (
    <ol reversed className="flex flex-col">
      {[...match.log].reverse().map((entry) => (
        <li
          key={entry.n}
          className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 border-t border-line py-1 text-sm sm:grid-cols-[3rem_10rem_minmax(0,1fr)]"
        >
          <span className="font-mono text-muted">{entry.n}</span>
          <span className="font-semibold">{match.seats[entry.seat]?.name ?? `Sitzplatz ${entry.seat + 1}`}</span>
          <code className="col-span-2 overflow-x-auto font-mono text-xs sm:col-span-1">
            {JSON.stringify(entry.event)}
          </code>
        </li>
      ))}
    </ol>
  );
}

export function LiveMatch({ id }: { id: string }) {
  const live = useMatch(id);
  const known = live.phase === "ready";

  useEffect(() => {
    if (known) rememberMatch(id);
  }, [id, known]);

  if (live.phase === "loading") return <MatchSkeleton />;
  if (live.phase === "missing") {
    return (
      <Notice title="Dieses Match gibt es nicht">
        Die Kennung <code className="font-mono">{id}</code> ist unbekannt oder das Match ist abgelaufen. Matches
        verschwinden 24 Stunden nach dem letzten Zug.
      </Notice>
    );
  }
  if (live.phase === "error") {
    return (
      <Notice title="Der Server ist nicht erreichbar">
        {live.message} Die Seite versucht es von selbst weiter.
      </Notice>
    );
  }

  const { match, connection } = live;
  const winner = match.result?.winner ?? null;

  return (
    <div className="flex flex-col gap-4">
      {connection === "reconnecting" ? (
        <p role="status" className="border border-warn bg-surface p-2 text-sm font-semibold text-warn">
          Verbindung unterbrochen. Der Stand unten ist der letzte bekannte, die Seite verbindet sich neu.
        </p>
      ) : null}

      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{match.game.name}</span>
          <span className="font-mono">{match.id}</span>
          <span>
            {match.moveCount} {match.moveCount === 1 ? "Zug" : "Züge"}
          </span>
        </div>
        <h1 className="text-xl font-semibold" aria-live="polite">
          {STATUS_LABEL[match.status]}
        </h1>
        {match.status === "finished" ? (
          <p className="text-lg">
            {winner === null
              ? "Unentschieden."
              : `${match.seats[winner]?.name ?? `Sitzplatz ${winner + 1}`} gewinnt.`}
          </p>
        ) : null}
      </header>

      <ul className="grid gap-2 sm:grid-cols-2">
        {match.seats.map((seat) => (
          <SeatPanel key={seat.seat} seat={seat} match={match} />
        ))}
      </ul>

      {match.status === "waiting" ? (
        <JoinBriefing id={match.id} />
      ) : (
        <section aria-labelledby="spielfeld-titel" className="flex flex-col gap-2">
          <h2 id="spielfeld-titel" className="font-semibold">
            Spielfeld
          </h2>
          <GameView match={match} />
        </section>
      )}

      <section aria-labelledby="verlauf-titel" className="flex flex-col gap-2">
        <h2 id="verlauf-titel" className="font-semibold">
          Verlauf
        </h2>
        <MoveLog match={match} />
      </section>
    </div>
  );
}
