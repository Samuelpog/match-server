"use client";

import type { ArenaController } from "@/lib/viewer/controller";
import { formatClock } from "./format";
import { useMeta, usePlayback } from "./use-playback";

/** Aktueller Tick, verbleibende Spielzeit und ob man gerade live zusieht. */
export function MatchClock({ controller }: { controller: ArenaController }) {
  const meta = useMeta(controller);
  const { tick, following, lastTick } = usePlayback(controller);
  const running = meta.status === "running";
  const remaining = Math.max(0, meta.tickLimit - tick);
  const mode =
    meta.status === "waiting"
      ? { text: "Wartet auf Bots", tone: "border-warn text-warn" }
      : running && following
        ? { text: "Live", tone: "border-danger bg-danger text-space" }
        : running
          ? { text: `Zeitversetzt, ${lastTick - tick} Ticks zurück`, tone: "border-warn text-warn" }
          : meta.status === "aborted"
            ? { text: "Abgebrochen", tone: "border-line text-muted" }
            : { text: "Replay", tone: "border-line text-muted" };

  return (
    <section aria-label="Match-Status" className="flex flex-col items-center gap-0.5 text-center">
      <span className={`label border px-1 font-semibold ${mode.tone}`}>{mode.text}</span>
      <p className="tabular text-xl leading-none font-semibold">
        {tick}
        <span className="text-base text-muted"> / {meta.tickLimit}</span>
      </p>
      <p className="label">Tick</p>
      <p className="tabular text-sm text-muted">
        noch {remaining} Ticks, etwa {formatClock(remaining * controller.tickMs)} min
      </p>
    </section>
  );
}
