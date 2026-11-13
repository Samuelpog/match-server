"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { abortMatch, getMatch } from "@/lib/client/arena-api";
import { downloadReplay } from "@/lib/client/replay-store";
import { useMatchStream } from "@/lib/client/use-match-stream";
import type { ArenaController } from "@/lib/viewer/controller";
import { isOver } from "@/lib/viewer/model";
import { Arena } from "./arena/Arena";
import { OwnerMark } from "./arena/OwnerMark";
import { useMeta } from "./arena/use-playback";
import { BotBriefing } from "./BotBriefing";
import { ArenaSkeleton, ConfirmButton, Notice } from "./ui";

/** Liegt über dem Schlachtfeld, solange noch nicht beide Bots da sind. */
function WaitingRoom({ controller }: { controller: ArenaController }) {
  const meta = useMeta(controller);
  if (meta.status !== "waiting") return null;
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex justify-center p-2">
      <section role="status" className="flex flex-col gap-0.5 border border-warn bg-surface/95 p-1.5 sm:p-2">
        <h2 className="font-semibold text-warn">Wartet auf Bots</h2>
        <ul className="flex flex-col text-sm">
          {meta.players.map((player, side) => (
            <li key={side} className="flex items-center gap-1">
              <OwnerMark owner={side === 0 ? 1 : 2} size={14} />
              <span className="text-muted">Spieler {side + 1}:</span>
              <span className="font-semibold">{player.joined ? player.name : "noch frei"}</span>
              {player.joined ? <span className="text-ok">bereit</span> : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Das Match startet von selbst, sobald beide Plätze besetzt sind.</p>
      </section>
    </div>
  );
}

function Details({ controller, id, embedded }: { controller: ArenaController; id: string; embedded: boolean }) {
  const meta = useMeta(controller);
  const [briefing, setBriefing] = useState<string | null>(null);
  const waiting = meta.status === "waiting";

  useEffect(() => {
    if (!waiting) return;
    const abort = new AbortController();
    getMatch(id, abort.signal)
      .then((response) => setBriefing(response.briefing))
      .catch(() => {
        // Ohne Auftragstext bleibt das Wartezimmer benutzbar, der Text fehlt dann.
      });
    return () => abort.abort();
  }, [id, waiting]);

  return (
    <>
      {/* In einer Serie stehen die Verbindungsdaten bei der Serie, nicht bei jedem Spiel. */}
      {waiting && !embedded ? <BotBriefing text={briefing} scope="Match" /> : null}
      {!isOver(meta.status) && !embedded ? (
        <ConfirmButton
          label="Match abbrechen"
          question="Das Match endet sofort ohne Sieger. Wirklich abbrechen?"
          confirm="Ja, abbrechen"
          onConfirm={() => abortMatch(id)}
        />
      ) : null}
    </>
  );
}

function Heading({ controller }: { controller: ArenaController }) {
  const meta = useMeta(controller);
  return (
    <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h1 className="text-lg font-semibold">
        {meta.players[0].name} <span className="text-muted">gegen</span> {meta.players[1].name}
      </h1>
      <p className="flex flex-wrap gap-x-2 text-sm text-muted">
        {meta.label ? <span>{meta.label}</span> : null}
        <span>
          Match <span className="font-mono">{meta.id}</span>
        </span>
        {meta.series ? (
          <Link href={`/s/${meta.series.id}`} className="underline underline-offset-2 hover:text-ink">
            Spiel {meta.series.game} der Serie <span className="font-mono">{meta.series.id}</span>
          </Link>
        ) : null}
      </p>
    </header>
  );
}

/**
 * Ein Match vom Server, live oder als Replay. `embedded`: als Teil der
 * Serien-Seite, dann ohne eigene Überschrift und ohne Abbrechen-Knopf.
 */
export function MatchView({
  id,
  embedded = false,
  flip = false,
}: {
  id: string;
  embedded?: boolean;
  /** Seiten in der Anzeige vertauschen, damit ein Teilnehmer einer Serie seine Farbe behält. */
  flip?: boolean;
}) {
  const stream = useMatchStream(id, flip);

  if (stream.phase === "loading") {
    return (
      <ArenaSkeleton
        note={
          stream.waking
            ? "Der Server wacht gerade auf. Das dauert bis zu einer Minute, die Seite wartet von selbst."
            : undefined
        }
      />
    );
  }
  if (stream.phase === "missing") {
    return (
      <Notice
        title="Dieses Match kennt der Server nicht"
        actions={
          stream.local ? (
            <Link
              href={`/replay?id=${encodeURIComponent(id)}`}
              className="flex min-h-6 items-center bg-accent px-2 font-semibold text-on-accent"
            >
              Gespeichertes Replay ansehen
            </Link>
          ) : null
        }
      >
        Die Kennung <code className="font-mono">{id}</code> ist unbekannt, oder der Server wurde seit dem Match neu
        gestartet. Er hält Matches nur im Arbeitsspeicher und vergisst sie beim Einschlafen und bei jedem neuen Stand.
        {stream.local ? " In diesem Browser liegt noch eine Kopie." : " In diesem Browser liegt keine Kopie."}
      </Notice>
    );
  }
  if (stream.phase === "error") {
    return (
      <Notice title="Der Server ist nicht erreichbar">{stream.message} Die Seite versucht es von selbst weiter.</Notice>
    );
  }

  const { controller, connection, replay } = stream;
  return (
    <div className="flex flex-col gap-2">
      {embedded ? null : <Heading controller={controller} />}
      {connection === "reconnecting" ? (
        <p role="status" className="border border-warn bg-surface p-1 text-sm font-semibold text-warn">
          Verbindung unterbrochen. Zu sehen ist der letzte bekannte Stand, die Seite verbindet sich neu.
        </p>
      ) : null}
      <Arena
        controller={controller}
        overlay={<WaitingRoom controller={controller} />}
        resultActions={
          <>
            <button
              type="button"
              onClick={() => downloadReplay(replay)}
              className="flex min-h-5 items-center border border-line px-2 hover:border-ink"
            >
              Replay als Datei speichern
            </button>
            {controller.meta.series && !embedded ? (
              <Link
                href={`/s/${controller.meta.series.id}`}
                className="flex min-h-5 items-center border border-line px-2 hover:border-ink"
              >
                Zur Serie
              </Link>
            ) : null}
          </>
        }
      />
      <Details controller={controller} id={id} embedded={embedded} />
    </div>
  );
}
