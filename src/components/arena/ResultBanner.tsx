"use client";

import Link from "next/link";
import { useState } from "react";
import type { ArenaController } from "@/lib/viewer/controller";
import { number, OWNER_TEXT, reasonText } from "./format";
import { OwnerMark } from "./OwnerMark";
import { useMeta, usePlayback } from "./use-playback";

/**
 * Auswertung am Ende: wer gewonnen hat, warum, und mit welchem Endstand.
 * Erscheint, sobald der Abspielkopf das Ende erreicht, und lässt sich
 * schließen, damit man das Schlachtfeld im Endzustand sieht.
 */
export function ResultBanner({ controller, actions }: { controller: ArenaController; actions?: React.ReactNode }) {
  const meta = useMeta(controller);
  const { atEnd, lastTick } = usePlayback(controller);
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const result = meta.result;
  if (!atEnd || !result || closedFor === meta.id) return null;

  const stats = controller.buffer.stats[lastTick];
  const winner = result.winner;
  const title =
    result.reason === "aborted" ? "Abgebrochen" : winner === 0 ? "Unentschieden" : `${meta.players[winner - 1].name} gewinnt`;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-space/70 p-2">
      <section
        role="status"
        aria-live="polite"
        className={`flex w-full max-w-[560px] flex-col gap-2 border bg-surface p-2 sm:p-3 ${
          winner === 1 ? "border-p1" : winner === 2 ? "border-p2" : "border-line"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="label">Auswertung nach Tick {lastTick}</span>
            <h2 className={`flex items-center gap-1 text-lg font-semibold ${OWNER_TEXT[winner]}`}>
              {winner !== 0 ? <OwnerMark owner={winner} size={20} /> : null}
              {title}
            </h2>
            <p className="text-sm text-muted">{reasonText(result.reason)}</p>
          </div>
          <button
            type="button"
            onClick={() => setClosedFor(meta.id)}
            className="h-5 border border-line px-1 text-sm hover:border-ink"
          >
            Schließen
          </button>
        </div>

        {stats ? (
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="label text-left">
                <th scope="col" className="font-normal">
                  Endstand
                </th>
                <th scope="col" className="text-right font-normal text-p1">
                  {meta.players[0].name}
                </th>
                <th scope="col" className="text-right font-normal text-p2">
                  {meta.players[1].name}
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Schiffe gesamt", stats.ships],
                  ["Planeten", stats.planets],
                  ["Produktion je Tick", stats.production],
                ] as const
              ).map(([label, pair]) => (
                <tr key={label} className="border-t border-line">
                  <th scope="row" className="py-0.5 text-left font-normal text-muted">
                    {label}
                  </th>
                  <td className="text-right font-semibold">{number.format(pair[0])}</td>
                  <td className="text-right font-semibold">{number.format(pair[1])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => {
              controller.seek(0);
              controller.play();
            }}
            className="flex min-h-5 items-center bg-accent px-2 font-semibold text-on-accent"
          >
            Von vorn ansehen
          </button>
          {actions}
          <Link href="/" className="flex min-h-5 items-center border border-line px-2 hover:border-ink">
            Zur Lobby
          </Link>
        </div>
      </section>
    </div>
  );
}
