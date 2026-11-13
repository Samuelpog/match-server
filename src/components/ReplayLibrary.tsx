"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReplayResponse } from "@/lib/arena/api-types";
import { deleteReplay, downloadReplay, listReplays, loadReplay, saveReplay, type ReplaySummary } from "@/lib/client/replay-store";
import { parseReplayFile } from "@/lib/viewer/adapter";
import { controllerFromReplay } from "@/lib/viewer/session";
import { Arena } from "./arena/Arena";
import { ArenaSkeleton, ConfirmButton, Notice } from "./ui";

const REASONS: Record<string, string> = {
  elimination: "Auslöschung",
  ships: "mehr Schiffe",
  growth: "höhere Produktion",
  draw: "unentschieden",
  aborted: "abgebrochen",
};

/** Spielt ein vollständiges Replay ab, aus dem Browser-Speicher oder aus einer Datei. */
function Player({ replay, stored, onStored }: { replay: ReplayResponse; stored: boolean; onStored: () => void }) {
  const controller = useMemo(() => controllerFromReplay(replay), [replay]);
  const { match } = replay;
  return (
    <div className="flex flex-col gap-2">
      <header className="flex flex-wrap items-baseline gap-x-2">
        <h1 className="text-lg font-semibold">
          {match.players[0].name ?? "Sitz 1"} <span className="text-muted">gegen</span> {match.players[1].name ?? "Sitz 2"}
        </h1>
        <span className="text-sm text-muted">
          Replay {match.label ? `„${match.label}" · ` : ""}
          <span className="font-mono">{match.id}</span>
        </span>
        <Link href="/replay" className="ml-auto text-sm underline underline-offset-2 hover:text-ink">
          Alle Replays
        </Link>
      </header>
      <Arena
        controller={controller}
        resultActions={
          <button
            type="button"
            onClick={() => downloadReplay(replay)}
            className="flex min-h-5 items-center border border-line px-2 hover:border-ink"
          >
            Replay als Datei speichern
          </button>
        }
      />
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => downloadReplay(replay)}
          className="min-h-5 border border-line px-2 text-sm hover:border-ink"
        >
          Als Datei speichern
        </button>
        {stored ? null : (
          <button
            type="button"
            onClick={() => saveReplay(replay).then(onStored)}
            className="min-h-5 border border-line px-2 text-sm hover:border-ink"
          >
            In diesem Browser ablegen
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Replays: Liste der im Browser abgelegten Matches, Laden einer Datei, und
 * mit `?id=` das Abspielen eines abgelegten Matches.
 */
export function ReplayLibrary() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const input = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<ReplaySummary[] | null>(null);
  const [stored, setStored] = useState<{ id: string; replay: ReplayResponse | null } | null>(null);
  const [file, setFile] = useState<{ replay: ReplayResponse; stored: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let alive = true;
    listReplays()
      .then((replays) => alive && setList(replays))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadReplay(id)
      .then((replay) => alive && setStored({ id, replay }))
      .catch(() => alive && setStored({ id, replay: null }));
    return () => {
      alive = false;
    };
  }, [id]);

  async function read(source: File | undefined) {
    if (!source) return;
    setError(null);
    try {
      if (source.size > 20_000_000) throw new Error("Die Datei ist größer als 20 MB. Ein Replay ist viel kleiner.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(await source.text());
      } catch {
        throw new Error("Die Datei enthält kein JSON. Erwartet wird ein Replay, wie es diese Seite speichert.");
      }
      setFile({ replay: parseReplayFile(parsed), stored: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Datei ließ sich nicht lesen.");
    }
  }

  if (file) {
    return (
      <Player
        replay={file.replay}
        stored={file.stored}
        onStored={() => setFile((now) => (now ? { ...now, stored: true } : now))}
      />
    );
  }

  if (id) {
    if (stored?.id !== id) return <ArenaSkeleton note="Replay wird geladen …" />;
    if (!stored.replay) {
      return (
        <Notice
          title="Dieses Replay liegt nicht in diesem Browser"
          actions={
            <Link href="/replay" className="flex min-h-6 items-center bg-accent px-2 font-semibold text-on-accent">
              Alle Replays
            </Link>
          }
        >
          Unter der Kennung <code className="font-mono">{id}</code> ist hier nichts abgelegt. Replays liegen je Browser:
          was auf einem anderen Gerät gespeichert wurde, kommt nur als Datei herüber.
        </Notice>
      );
    }
    return <Player replay={stored.replay} stored onStored={() => {}} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex max-w-[720px] flex-col gap-0.5">
        <span className="label">Archiv</span>
        <h1 className="text-xl font-semibold">Replays</h1>
        <p className="text-muted">
          Jedes Match, das du bis zum Ende ansiehst, wird in diesem Browser abgelegt. Der Server selbst vergisst Matches,
          sobald er einschläft. Als Datei gespeichert lässt sich ein Replay weitergeben.
        </p>
      </header>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          read(event.dataTransfer.files[0]);
        }}
        className={`flex max-w-[720px] flex-col items-start gap-1 border border-dashed p-2 ${
          dragging ? "border-ink bg-raised" : "border-line bg-surface"
        }`}
      >
        <h2 className="font-semibold">Replay-Datei laden</h2>
        <p className="text-sm text-muted">Datei hierher ziehen oder auswählen. Sie bleibt auf deinem Gerät.</p>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            read(event.target.files?.[0]);
            event.target.value = "";
          }}
          className="sr-only"
          id="replay-datei"
        />
        <label
          htmlFor="replay-datei"
          className="flex min-h-6 cursor-pointer items-center bg-accent px-2 font-semibold text-on-accent has-focus-visible:outline-2"
        >
          Datei auswählen
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="abgelegt-titel" className="flex flex-col">
        <h2 id="abgelegt-titel" className="label pb-0.5">
          In diesem Browser abgelegt
        </h2>
        {list === null ? (
          <p className="text-sm text-muted">Liste wird geladen …</p>
        ) : list.length === 0 ? (
          <p className="border-t border-line py-1 text-sm text-muted">
            Noch nichts abgelegt. Starte in der <Link href="/" className="underline underline-offset-2">Lobby</Link> ein
            Demo-Match und sieh es bis zum Ende an.
          </p>
        ) : (
          <ul>
            {list.map((replay) => (
              <li
                key={replay.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 border-t border-line py-1 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <Link href={`/replay?id=${encodeURIComponent(replay.id)}`} className="flex min-w-0 flex-col hover:underline">
                  <span className="truncate font-semibold">
                    <span className="text-p1">{replay.names[0]}</span> <span className="text-muted">gegen</span>{" "}
                    <span className="text-p2">{replay.names[1]}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {replay.winner === null ? "Kein Sieger" : `Sieg ${replay.names[replay.winner]}`} (
                    {REASONS[replay.reason] ?? replay.reason}) · {replay.ticks} Ticks
                    {replay.label ? ` · ${replay.label}` : ""}
                    {replay.series ? ` · Serie ${replay.series.id}, Spiel ${replay.series.game}` : ""} ·{" "}
                    {new Date(replay.savedAt).toLocaleString("de-DE")}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => router.push(`/replay?id=${encodeURIComponent(replay.id)}`)}
                  className="min-h-5 border border-line px-2 text-sm hover:border-ink"
                >
                  Ansehen
                </button>
                <span className="col-span-2 sm:col-span-1">
                  <ConfirmButton
                    label="Löschen"
                    question="Aus diesem Browser löschen?"
                    confirm="Ja, löschen"
                    onConfirm={async () => {
                      await deleteReplay(replay.id);
                      setList(await listReplays());
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
