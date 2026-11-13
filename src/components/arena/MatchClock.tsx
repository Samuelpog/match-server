"use client";

import { useEffect, useRef } from "react";
import { VIEW_ROUND_MS, type ArenaController } from "@/lib/viewer/controller";
import { isOver } from "@/lib/viewer/model";
import { PHASE_LABEL, phaseOf } from "@/lib/viewer/phases";
import { formatClock } from "./format";
import { useMeta, usePlayback } from "./use-playback";

/** Aktuelle Runde, ihr Schritt, verbleibende Spielzeit und ob man gerade live zusieht. */
export function MatchClock({ controller }: { controller: ArenaController }) {
  const meta = useMeta(controller);
  const { round, showing, following, lastRound, speed, playing } = usePlayback(controller);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const running = meta.status === "running";
  const over = isOver(meta.status);
  // Ein beendetes Match ist so lang, wie es gedauert hat, nicht so lang wie sein Limit.
  const end = over ? Math.max(0, lastRound) : meta.rounds;
  const remaining = Math.max(0, end - round);
  const live = running && following;
  const mode =
    meta.status === "waiting"
      ? { text: "Wartet auf Bots", tone: "border-warn text-warn" }
      : live
        ? { text: "Live", tone: "border-danger bg-danger text-space" }
        : running
          ? { text: `Zeitversetzt, ${lastRound - round} Runden zurück`, tone: "border-warn text-warn" }
          : meta.status === "aborted"
            ? { text: "Abgebrochen", tone: "border-line text-muted" }
            : { text: "Replay", tone: "border-line text-muted" };

  // Der Schritt wechselt mehrmals je Runde. Er wird direkt gesetzt, ohne React neu zeichnen zu lassen.
  useEffect(
    () =>
      controller.onFrame((pos) => {
        const node = phaseRef.current;
        if (!node) return;
        const fraction = pos - Math.floor(pos + 1e-9);
        const idle = fraction < 1e-6;
        const text = !idle
          ? PHASE_LABEL[phaseOf(fraction)]
          : live
            ? "Bots sind am Zug"
            : over && pos >= lastRound
              ? "Endstand"
              : playing
                ? ""
                : "Angehalten";
        if (node.textContent !== text) node.textContent = text;
      }),
    [controller, live, over, lastRound, playing],
  );

  const perRound = live || meta.status === "waiting" ? meta.roundMs : VIEW_ROUND_MS / speed;

  return (
    <section aria-label="Match-Status" className="flex flex-col items-center gap-0.5 text-center">
      <span className={`label border px-1 font-semibold ${mode.tone}`}>{mode.text}</span>
      <p className="tabular text-xl leading-none font-semibold">
        {showing}
        <span className="text-base text-muted"> / {end}</span>
      </p>
      <p className="label">
        Runde{over && end < meta.rounds ? ` · Limit ${meta.rounds}` : ""}
        <span aria-hidden="true"> · </span>
        <span ref={phaseRef} className="text-ink" />
      </p>
      <p className="tabular text-sm text-muted">
        {meta.status === "waiting"
          ? `bei voller Länge etwa ${formatClock(meta.rounds * meta.roundMs)} min`
          : over && remaining === 0
            ? `${lastRound} Runden gespielt`
            : `noch ${remaining} ${remaining === 1 ? "Runde" : "Runden"}, etwa ${formatClock(remaining * perRound)} min`}
      </p>
    </section>
  );
}
