"use client";

import { useEffect, useMemo, useRef } from "react";
import { SPEEDS, type ArenaController } from "@/lib/viewer/controller";
import { isOver, share } from "@/lib/viewer/model";
import { useMeta, usePlayback } from "./use-playback";

const CHART_HEIGHT = 56;

/** Verlauf des Punkteanteils als Fläche: unten Spieler 1, oben Spieler 2. */
function balancePath(controller: ArenaController, lastRound: number, axis: number): { area: string; line: string } {
  const frames = controller.buffer.frames;
  if (lastRound < 0) return { area: "", line: "" };
  let line = "";
  for (let t = 0; t <= lastRound; t++) {
    const x = (t / axis) * 1000;
    const seats = frames[t].seats;
    const y = (1 - share([seats[0].score, seats[1].score])) * CHART_HEIGHT;
    line += `${t === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  const end = ((lastRound / axis) * 1000).toFixed(1);
  return { line, area: `${line}L${end} ${CHART_HEIGHT}L0 ${CHART_HEIGHT}Z` };
}

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="flex h-5 min-w-5 items-center justify-center border border-line bg-surface px-1 font-semibold hover:border-ink disabled:opacity-40 disabled:hover:border-line"
    >
      {children}
    </button>
  );
}

/**
 * Zeitleiste mit dem Verlauf des Kräfteverhältnisses, Marken an jedem
 * Besitzerwechsel und der Steuerung: abspielen, anhalten, rundenweise vor und
 * zurück, Tempo, zurück zum Live-Stand. Geht im laufenden wie im beendeten Match.
 */
export function Timeline({ controller }: { controller: ArenaController }) {
  const meta = useMeta(controller);
  const { round: round, lastRound: lastRound, playing, following, speed, atEnd } = usePlayback(controller);
  const headRef = useRef<HTMLDivElement>(null);
  const wasPlaying = useRef(false);
  const over = isOver(meta.status);
  // Ein laufendes Match zeigt die ganze geplante Länge, damit man sieht, wie weit es ist.
  const axis = Math.max(1, over ? lastRound : Math.max(meta.rounds, lastRound));

  useEffect(
    () =>
      controller.onFrame((pos) => {
        if (headRef.current) headRef.current.style.left = `${(Math.min(pos, axis) / axis) * 100}%`;
      }),
    [controller, axis],
  );

  const drawnTo = lastRound;
  const { area, line } = useMemo(() => balancePath(controller, drawnTo, axis), [controller, drawnTo, axis]);
  const captures = controller.buffer.captures;

  return (
    <section aria-label="Zeitleiste und Wiedergabe" className="flex flex-col gap-1 border border-line bg-surface p-1.5 sm:p-2">
      <div className="relative bg-space" style={{ height: CHART_HEIGHT }}>
        <svg
          viewBox={`0 0 1000 ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        >
          {lastRound >= 0 ? (
            <>
              <rect x="0" y="0" width={(lastRound / axis) * 1000} height={CHART_HEIGHT} fill="var(--color-p2)" fillOpacity="0.5" />
              {/* Erst deckend abdunkeln, sonst mischt sich das Blau mit dem Orange darunter. */}
              <path d={area} fill="var(--color-space)" />
              <path d={area} fill="var(--color-p1)" fillOpacity="0.5" />
              <path d={line} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
          <line
            x1="0"
            x2="1000"
            y1={CHART_HEIGHT / 2}
            y2={CHART_HEIGHT / 2}
            stroke="var(--color-space)"
            strokeOpacity="0.8"
            strokeDasharray="4 6"
            vectorEffect="non-scaling-stroke"
          />
          {captures.map((event) =>
            event.round <= lastRound ? (
              <rect
                key={`${event.round}-${event.planet}`}
                x={(event.round / axis) * 1000 - 1}
                y={event.after.owner === 1 ? CHART_HEIGHT - 9 : 0}
                width="2"
                height="9"
                fill="var(--color-ink)"
                fillOpacity="0.9"
              />
            ) : null,
          )}
        </svg>
        <div ref={headRef} className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink" />
        <input
          type="range"
          className="scrubber absolute inset-y-0 left-0 h-full"
          style={{ width: `${(Math.max(0, lastRound) / axis) * 100}%` }}
          min={0}
          max={Math.max(0, lastRound)}
          step={1}
          value={round}
          disabled={lastRound < 1}
          aria-label="Position im Match, in Runden"
          aria-valuetext={`Runde ${round} von ${lastRound}`}
          onPointerDown={() => {
            wasPlaying.current = playing;
            controller.pause();
          }}
          onPointerUp={() => {
            if (wasPlaying.current) controller.play();
          }}
          onChange={(event) => controller.seek(Number(event.target.value))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="flex gap-0.5">
          <IconButton label="Zum Anfang" onClick={() => controller.seek(0)} disabled={lastRound < 1}>
            <span aria-hidden="true">⏮</span>
          </IconButton>
          <IconButton label="Eine Runde zurück" onClick={() => controller.step(-1)} disabled={round <= 0}>
            <span aria-hidden="true">◀</span>
          </IconButton>
          <button
            type="button"
            onClick={() => controller.toggle()}
            disabled={lastRound < 1}
            className="flex h-5 min-w-12 items-center justify-center bg-accent px-2 font-semibold text-on-accent disabled:opacity-40"
          >
            {playing ? "Pause" : atEnd ? "Noch einmal" : "Abspielen"}
          </button>
          <IconButton label="Eine Runde vor" onClick={() => controller.step(1)} disabled={round >= lastRound}>
            <span aria-hidden="true">▶</span>
          </IconButton>
          <IconButton
            label={over ? "Zum Ende" : "Zurück zum Live-Stand"}
            onClick={() => controller.goLive()}
            disabled={over ? atEnd : following}
          >
            {over ? <span aria-hidden="true">⏭</span> : <span className="label text-ink">Live</span>}
          </IconButton>
        </div>

        <div role="group" aria-label="Abspieltempo" className="flex items-center gap-0.5">
          <span className="label mr-0.5">Tempo</span>
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={speed === value && !following}
              onClick={() => controller.setSpeed(value)}
              className={`tabular h-5 min-w-5 border px-0.5 text-sm ${
                speed === value && !following ? "border-ink bg-raised font-semibold" : "border-line hover:border-ink"
              }`}
            >
              {value}×
            </button>
          ))}
        </div>

        <p className="tabular ml-auto text-sm text-muted">
          Runde {round} / {lastRound < 0 ? 0 : lastRound}
          {following && !over ? " · folgt live" : ""}
        </p>
      </div>

      <p className="text-xs text-muted">
        Die Fläche zeigt den Anteil an den Punkten: unten <span className="text-p1">Spieler 1</span>, oben{" "}
        <span className="text-p2">Spieler 2</span>. Striche am Rand markieren Eroberungen der jeweiligen Seite. Tasten: Leertaste, ← →, Umschalt
        + ← → für zehn Runden, Pos1, Ende.
      </p>
    </section>
  );
}
