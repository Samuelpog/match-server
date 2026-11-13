"use client";

import { share } from "@/lib/viewer/buffer";
import type { ArenaController } from "@/lib/viewer/controller";
import { number } from "./format";
import { usePlayback } from "./use-playback";

function Tug({
  label,
  values,
  unit,
  thick,
}: {
  label: string;
  values: readonly [number, number];
  unit: string;
  thick?: boolean;
}) {
  const left = share(values) * 100;
  return (
    <div className="grid grid-cols-[minmax(4rem,auto)_minmax(0,1fr)_minmax(4rem,auto)] items-center gap-x-1">
      <span className={`tabular text-right font-semibold text-p1 ${thick ? "text-lg" : "text-sm"}`}>
        {number.format(values[0])}
        {unit}
      </span>
      <div
        role="img"
        aria-label={`${label}: ${values[0]} zu ${values[1]}`}
        className={`relative flex overflow-hidden border border-line bg-raised ${thick ? "h-3" : "h-1.5"}`}
      >
        <div className="bg-p1 transition-[width] duration-200 ease-out" style={{ width: `${left}%` }} />
        {/* Trennstrich zwischen den Seiten: wandert mit dem Kräfteverhältnis. */}
        <div className="w-0.5 shrink-0 bg-ink" />
        <div className="flex-1 bg-p2" />
        {/* Feste Mittelmarke: links davon führt Spieler 2, rechts davon Spieler 1. */}
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-space/70" />
      </div>
      <span className={`tabular font-semibold text-p2 ${thick ? "text-lg" : "text-sm"}`}>
        {number.format(values[1])}
        {unit}
      </span>
      <span className="label col-span-3 text-center">{label}</span>
    </div>
  );
}

/** Kräfteverhältnis beider Seiten: alle Schiffe (auf Planeten und in der Luft) und die Produktion je Tick. */
export function PowerBar({ controller }: { controller: ArenaController }) {
  const { tick } = usePlayback(controller);
  const stats = controller.buffer.stats[tick];
  if (!stats) return null;
  return (
    <section aria-label="Kräfteverhältnis" className="flex flex-col gap-1">
      <Tug label="Schiffe gesamt" values={stats.ships} unit="" thick />
      <Tug label="Produktion je Tick" values={stats.production} unit="" />
    </section>
  );
}
