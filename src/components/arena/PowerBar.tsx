"use client";

import type { ArenaController } from "@/lib/viewer/controller";
import { share } from "@/lib/viewer/model";
import { number } from "./format";
import { usePlayback } from "./use-playback";

function Tug({ label, values, thick }: { label: string; values: readonly [number, number]; thick?: boolean }) {
  const left = share(values) * 100;
  return (
    <div className="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)_minmax(3rem,auto)] items-center gap-x-1">
      <span className={`tabular text-right font-semibold text-p1 ${thick ? "text-lg" : "text-sm"}`}>{number.format(values[0])}</span>
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
      <span className={`tabular font-semibold text-p2 ${thick ? "text-lg" : "text-sm"}`}>{number.format(values[1])}</span>
      <span className="label col-span-3 text-center">{label}</span>
    </div>
  );
}

/**
 * Kräfteverhältnis beider Seiten. Oben die Punkte: dieselbe Größe, die am
 * Ende entscheidet. Darunter alle Schiffe (auf Planeten und unterwegs) und
 * die Produktion je Runde.
 */
export function PowerBar({ controller }: { controller: ArenaController }) {
  const { round } = usePlayback(controller);
  const seats = controller.buffer.frames[round]?.seats;
  if (!seats) return null;
  return (
    <section aria-label="Kräfteverhältnis" className="flex flex-col gap-1">
      <Tug label="Punkte" values={[seats[0].score, seats[1].score]} thick />
      <div className="grid grid-cols-2 gap-x-2">
        <Tug label="Schiffe gesamt" values={[seats[0].ships, seats[1].ships]} />
        <Tug label="Produktion je Runde" values={[seats[0].production, seats[1].production]} />
      </div>
    </section>
  );
}
