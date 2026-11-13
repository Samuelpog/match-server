"use client";

import type { ArenaController } from "@/lib/viewer/controller";
import { isOver, type Frame, type MatchMeta, type Player } from "@/lib/viewer/model";
import { number, OWNER_TEXT } from "./format";
import { OwnerMark } from "./OwnerMark";
import { useMeta, usePlayback } from "./use-playback";

/** Verbindungsstatus eines Bots in Worten und Farbe. */
function connection(meta: MatchMeta, player: Player): { text: string; tone: string } {
  const info = meta.players[player - 1];
  if (!info.joined) return { text: "Noch nicht beigetreten", tone: "text-warn" };
  if (info.builtIn) return { text: "Eingebauter Bot", tone: "text-muted" };
  if (isOver(meta.status)) return { text: "Externer Bot", tone: "text-muted" };
  if (info.absent) return { text: "Abwesend, es wird nicht mehr gewartet", tone: "text-danger" };
  if (!info.online) return { text: "Meldet sich nicht", tone: "text-warn" };
  return { text: "Verbunden", tone: "text-ok" };
}

/** Was der Bot in der gezeigten Runde getan hat. */
function turn(frame: Frame | undefined, side: number): { text: string; tone: string } | null {
  const seat = frame?.seats[side];
  if (!frame || !seat || seat.submitted === null) return null;
  if (!seat.submitted) return { text: "Frist verpasst, setzt aus", tone: "text-warn" };
  const rejected = frame.actions[side].filter((action) => !action.ok).length;
  if (rejected > 0) return { text: `${rejected} ${rejected === 1 ? "Aktion" : "Aktionen"} abgelehnt`, tone: "text-warn" };
  return { text: "Befehle pünktlich", tone: "text-muted" };
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    // Schmal: Beschriftung und Zahl in einer Zeile. Breiter: Zahl unter der Beschriftung.
    <div className="flex items-baseline justify-between gap-1 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0">
      <dt className="label">{label}</dt>
      <dd className="tabular text-base font-semibold sm:text-lg sm:leading-none">{value}</dd>
    </div>
  );
}

/** Name, Verbindung, Zugstatus und Kennzahlen eines Spielers. */
export function PlayerPanel({ controller, player }: { controller: ArenaController; player: Player }) {
  const meta = useMeta(controller);
  const { round, showing, atEnd } = usePlayback(controller);
  const side = player - 1;
  const info = meta.players[side];
  const seat = controller.buffer.frames[round]?.seats[side];
  // Aktionen gehören zur Runde, die gerade aufgelöst wird, die übrigen Zahlen zum Stand davor.
  const acting = controller.buffer.frames[showing];
  const actions = acting?.seats[side];
  const link = connection(meta, player);
  const move = turn(acting, side);
  // Den Sieger erst zeigen, wenn der Abspielkopf am Ende steht: ein Replay soll nichts verraten.
  const won = atEnd && meta.result?.winner === player;
  const mirrored = player === 2;

  return (
    <section
      aria-label={`Spieler ${player}: ${info.name}`}
      className={`flex min-w-0 flex-col gap-1 border bg-surface p-1.5 sm:p-2 ${won ? (player === 1 ? "border-p1" : "border-p2") : "border-line"}`}
    >
      <div className={`flex items-center gap-1 ${mirrored ? "sm:flex-row-reverse sm:text-right" : ""}`}>
        <OwnerMark owner={player} size={20} />
        <div className="flex min-w-0 flex-col">
          <span className="label">Spieler {player}</span>
          <span className={`truncate text-lg font-semibold ${OWNER_TEXT[player]}`}>{info.name}</span>
        </div>
        {won ? <span className="label ml-auto border border-current px-0.5 text-ink sm:mx-0">Sieger</span> : null}
      </div>
      <p className={`flex flex-wrap gap-x-1 text-xs ${mirrored ? "sm:justify-end" : ""}`}>
        <span className={`font-semibold ${link.tone}`}>{link.text}</span>
        {move ? <span className={move.tone}>{move.text}</span> : null}
      </p>
      {seat ? (
        <dl className={`mt-auto grid grid-cols-1 gap-x-2 sm:grid-cols-2 sm:gap-y-1 ${mirrored ? "sm:text-right" : ""}`}>
          <Figure label="Planeten" value={number.format(seat.planets)} />
          <Figure label="Aktionen" value={actions ? `${actions.used} / ${actions.limit}` : "–"} />
          <Figure label="Schiffe" value={number.format(seat.ships)} />
          <Figure label="Produktion" value={`+${number.format(seat.production)}`} />
        </dl>
      ) : null}
    </section>
  );
}
