"use client";

import { useEffect, useRef, useState } from "react";
import type { ArenaController } from "@/lib/viewer/controller";
import { drawScene } from "@/lib/viewer/render/draw";
import { computeLayout, mapAspect, planetAt, type Layout } from "@/lib/viewer/render/layout";
import { createStarfield, type Starfield } from "@/lib/viewer/render/starfield";
import { readTheme } from "@/lib/viewer/render/theme";
import { number, ownerName, OWNER_TEXT } from "./format";
import { OwnerMark } from "./OwnerMark";
import { useMeta, usePlayback } from "./use-playback";

interface Hover {
  planet: number;
  x: number;
  y: number;
}

/**
 * Das Schlachtfeld. Gezeichnet wird auf einer Canvas in jedem Bild des
 * Browsers; der Abspielkopf des Controllers rückt dabei mit vor. React
 * zeichnet hier nur den Rahmen und den Hinweis unter dem Mauszeiger.
 */
export function Battlefield({ controller, children }: { controller: ArenaController; children?: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const highlightRef = useRef(-1);
  const [hover, setHover] = useState<Hover | null>(null);
  const map = controller.buffer.map;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    const theme = readTheme(canvas);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stars: Starfield | null = null;
    let ratio = 1;
    let frame = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      layoutRef.current = computeLayout(map, rect.width, rect.height);
      stars = createStarfield(rect.width, rect.height, ratio, theme);
    };

    const loop = (now: number) => {
      controller.advance(now);
      const layout = layoutRef.current;
      if (layout && stars) {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawScene(ctx, layout, theme, stars, {
          buffer: controller.buffer,
          pos: controller.pos,
          tickMs: controller.tickMs,
          now,
          reducedMotion: motion.matches,
          highlight: highlightRef.current,
        });
      }
      frame = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [controller, map]);

  function onPointerMove(event: React.PointerEvent) {
    const layout = layoutRef.current;
    const wrap = wrapRef.current;
    if (!layout || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const planet = planetAt(layout, event.clientX - rect.left, event.clientY - rect.top);
    highlightRef.current = planet;
    setHover((current) => {
      if (planet < 0) return null;
      if (current?.planet === planet) return current;
      return { planet, x: layout.x[planet], y: layout.y[planet] - layout.r[planet] };
    });
  }

  function onPointerLeave() {
    highlightRef.current = -1;
    setHover(null);
  }

  // Seitenverhältnis der Karte, in Grenzen, damit die Fläche auf jedem Bildschirm brauchbar bleibt.
  const aspect = mapAspect(map);

  return (
    <div
      ref={wrapRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="relative w-full overflow-hidden border border-line bg-space"
      style={{ aspectRatio: String(aspect), maxHeight: "74vh", minHeight: 280 }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Sternenkarte mit Planeten und Flotten. Die Zahlen stehen auch in den Anzeigen daneben."
        className="absolute inset-0 h-full w-full"
      />
      {hover ? <PlanetHint controller={controller} hover={hover} /> : null}
      {children}
    </div>
  );
}

/** Einzelheiten zum Planeten unter dem Mauszeiger. */
function PlanetHint({ controller, hover }: { controller: ArenaController; hover: Hover }) {
  const { tick } = usePlayback(controller);
  const meta = useMeta(controller);
  const frame = controller.buffer.frameAt(tick);
  if (!frame) return null;
  const state = frame.planets[hover.planet];
  const def = controller.buffer.map.planets[hover.planet];
  const inbound: [number, number] = [0, 0];
  for (const fleet of controller.buffer.activeFleets(tick)) {
    if (fleet.to === hover.planet) inbound[fleet.owner - 1] += fleet.ships;
  }
  return (
    <div
      className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col border border-line bg-surface px-1 py-0.5 text-xs whitespace-nowrap"
      style={{ left: hover.x, top: hover.y - 10 }}
    >
      <span className="flex items-center gap-0.5 font-semibold">
        <OwnerMark owner={state.owner} size={12} />
        <span className={OWNER_TEXT[state.owner]}>{ownerName(meta, state.owner)}</span>
        <span className="text-muted">Planet {def.id}</span>
      </span>
      <span className="tabular">
        {number.format(state.ships)} Schiffe, +{def.growth} je Tick
      </span>
      {inbound[0] + inbound[1] > 0 ? (
        <span className="tabular text-muted">
          Im Anflug: <span className="text-p1">{number.format(inbound[0])}</span> /{" "}
          <span className="text-p2">{number.format(inbound[1])}</span>
        </span>
      ) : null}
    </div>
  );
}
