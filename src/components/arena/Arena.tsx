"use client";

import { useEffect } from "react";
import type { ArenaController } from "@/lib/viewer/controller";
import { Battlefield } from "./Battlefield";
import { MatchClock } from "./MatchClock";
import { PlayerPanel } from "./PlayerPanel";
import { PowerBar } from "./PowerBar";
import { ResultBanner } from "./ResultBanner";
import { RoundLog } from "./RoundLog";
import { Timeline } from "./Timeline";

/** Tastenkürzel der Wiedergabe. Greifen nicht, solange man in ein Feld tippt oder ein Bedienelement den Fokus hat. */
function useShortcuts(controller: ArenaController) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName)) return;
      const jump = event.shiftKey ? 10 : 1;
      if (event.key === " ") controller.toggle();
      else if (event.key === "ArrowLeft") controller.step(-jump);
      else if (event.key === "ArrowRight") controller.step(jump);
      else if (event.key === "Home") controller.seek(0);
      else if (event.key === "End") controller.goLive();
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller]);
}

/**
 * Die ganze Zuschauer-Ansicht eines Matches: Schlachtfeld, Kräfteverhältnis,
 * Spieler, Rundenprotokoll, Zeitleiste. Woher die Frames kommen (Server, Datei,
 * lokale Simulation), entscheidet, wer den Controller füllt.
 */
export function Arena({
  controller,
  resultActions,
  overlay,
}: {
  controller: ArenaController;
  /** Zusätzliche Knöpfe in der Auswertung, etwa „Replay speichern" oder „Nächstes Spiel". */
  resultActions?: React.ReactNode;
  /** Liegt über dem Schlachtfeld, etwa das Wartezimmer. */
  overlay?: React.ReactNode;
}) {
  useShortcuts(controller);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <PlayerPanel controller={controller} player={1} />
        <div className="order-first col-span-full flex flex-col justify-center gap-2 border border-line bg-surface p-1.5 sm:p-2 lg:order-none lg:col-span-1">
          <MatchClock controller={controller} />
          <PowerBar controller={controller} />
        </div>
        <PlayerPanel controller={controller} player={2} />
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-2">
          <Battlefield controller={controller}>
            {overlay}
            <ResultBanner controller={controller} actions={resultActions} />
          </Battlefield>
          <Timeline controller={controller} />
        </div>
        <RoundLog controller={controller} />
      </div>
    </div>
  );
}
