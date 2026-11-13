import type { ReplayBuffer } from "../buffer";
import type { Fleet, Owner, PlanetEvent } from "../model";
import type { Layout } from "./layout";
import type { Starfield } from "./starfield";
import { mix, rgba, WHITE, type ArenaTheme, type Rgb } from "./theme";

export interface Scene {
  buffer: ReplayBuffer;
  /** Position des Abspielkopfs in Ticks. */
  pos: number;
  /** Dauer eines Ticks bei Tempo 1, bestimmt die Länge der Effekte. */
  tickMs: number;
  /** Uhrzeit in Millisekunden, nur für das Funkeln der Sterne. */
  now: number;
  reducedMotion: boolean;
  /** Hervorgehobener Planet (Maus oder Tastatur), sonst `-1`. */
  highlight: number;
}

const BLACK: Rgb = [3, 5, 10];
const fleetScratch: Fleet[] = [];
const eventScratch: PlanetEvent[] = [];

const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u);
const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);

/** Gleichbleibende Pseudo-Zufallszahl in [0, 1) aus drei ganzen Zahlen. */
function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Wie lange ein Effekt dauert, gemessen in Ticks. Effekte hängen am
 * Abspielkopf, nicht an der Uhr: wer pausiert, friert sie ein, wer
 * zurückspult, sieht sie noch einmal.
 */
export function effectSpan(tickMs: number): number {
  return Math.min(5, Math.max(1.3, 750 / Math.max(1, tickMs)));
}

/** Zeichnet ein vollständiges Bild der Schlacht. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: ArenaTheme,
  stars: Starfield,
  scene: Scene,
): void {
  const { buffer, pos } = scene;
  const { width, height } = layout;

  ctx.drawImage(stars.image, 0, 0, width, height);
  if (!scene.reducedMotion) drawTwinkle(ctx, stars, scene.now);

  const frame = buffer.frameAt(pos);
  if (!frame) return;

  const span = effectSpan(scene.tickMs);
  const events = buffer.eventsWithin(pos, span, eventScratch);
  const fleets = buffer.activeFleets(pos, fleetScratch);

  drawLanes(ctx, layout, theme, fleets, pos);
  drawEffects(ctx, layout, theme, events, pos, span, "below");

  for (let i = 0; i < frame.planets.length; i++) {
    const state = frame.planets[i];
    let color = theme.owner[state.owner];
    // Nach einem Besitzerwechsel geht die Farbe weich von alt nach neu.
    for (const event of events) {
      if (event.planet === i && event.kind === "capture") {
        const u = clamp01(((pos - event.t) / span) * 2.2);
        color = mix(theme.owner[event.before.owner], theme.owner[event.after.owner], easeOut(u));
      }
    }
    drawPlanet(
      ctx,
      theme,
      layout.x[i],
      layout.y[i],
      layout.r[i],
      state.owner,
      color,
      state.ships,
      buffer.map.planets[i].growth,
      scene.highlight === i,
    );
  }

  drawFleets(ctx, layout, theme, fleets, pos);
  drawEffects(ctx, layout, theme, events, pos, span, "above");
}

function drawTwinkle(ctx: CanvasRenderingContext2D, stars: Starfield, now: number): void {
  for (const star of stars.twinklers) {
    const glow = 0.5 + 0.5 * Math.sin(star.phase + (now / star.period) * Math.PI * 2);
    ctx.fillStyle = `rgba(235,242,255,${0.15 + glow * 0.6})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size * (0.7 + glow * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Start- und Endpunkt einer Flugbahn: von Planetenrand zu Planetenrand. */
function path(layout: Layout, fleet: Fleet): { ax: number; ay: number; bx: number; by: number; ux: number; uy: number } {
  const dx = layout.x[fleet.to] - layout.x[fleet.from];
  const dy = layout.y[fleet.to] - layout.y[fleet.from];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  // Sehr nahe Planeten: nie mehr Rand abziehen, als Strecke da ist.
  const inset = Math.min(1, (length * 0.9) / (layout.r[fleet.from] + layout.r[fleet.to]));
  return {
    ax: layout.x[fleet.from] + ux * layout.r[fleet.from] * inset,
    ay: layout.y[fleet.from] + uy * layout.r[fleet.from] * inset,
    bx: layout.x[fleet.to] - ux * layout.r[fleet.to] * inset,
    by: layout.y[fleet.to] - uy * layout.r[fleet.to] * inset,
    ux,
    uy,
  };
}

function progress(fleet: Fleet, pos: number): number {
  return clamp01((pos - fleet.launch) / Math.max(1, fleet.arrive - fleet.launch));
}

/** Schwache Linie von der Flotte bis zum Ziel: zeigt, wohin sie will. */
function drawLanes(ctx: CanvasRenderingContext2D, layout: Layout, theme: ArenaTheme, fleets: Fleet[], pos: number): void {
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 6]);
  for (const fleet of fleets) {
    const p = path(layout, fleet);
    const u = progress(fleet, pos);
    ctx.strokeStyle = rgba(theme.owner[fleet.owner], 0.22);
    ctx.beginPath();
    ctx.moveTo(p.ax + (p.bx - p.ax) * u, p.ay + (p.by - p.ay) * u);
    ctx.lineTo(p.bx, p.by);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawPlanet(
  ctx: CanvasRenderingContext2D,
  theme: ArenaTheme,
  x: number,
  y: number,
  r: number,
  owner: Owner,
  color: Rgb,
  ships: number,
  growth: number,
  highlight: boolean,
): void {
  if (owner !== 0) {
    const halo = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 2.1);
    halo.addColorStop(0, rgba(color, 0.34));
    halo.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Kugel: dunkel getönt in der Farbe des Besitzers, Licht von links oben.
  const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  body.addColorStop(0, rgba(mix(color, BLACK, owner === 0 ? 0.55 : 0.42)));
  body.addColorStop(1, rgba(mix(color, BLACK, owner === 0 ? 0.86 : 0.8)));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Der Rand unterscheidet die Besitzer auch ohne Farbe: durchgezogen, gestrichelt, gepunktet.
  ctx.lineWidth = owner === 0 ? 1.25 : 2.25;
  ctx.strokeStyle = rgba(color, owner === 0 ? 0.75 : 1);
  if (owner === 2) ctx.setLineDash([r * 0.5, r * 0.22]);
  else if (owner === 0) ctx.setLineDash([1.5, 3.5]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (highlight) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(theme.ink, 0.9);
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  const digits = String(ships).length;
  const inside = r >= 17;
  const size = Math.max(10, Math.min(26, r * (digits >= 4 ? 0.5 : digits === 3 ? 0.6 : 0.72)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px ${theme.fontMono}`;
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(BLACK, 0.7);
  const shipsY = inside ? y - r * 0.14 : y;
  ctx.strokeText(String(ships), x, shipsY);
  ctx.fillStyle = rgba(theme.ink);
  ctx.fillText(String(ships), x, shipsY);

  // Produktionsrate: im Planeten, wenn Platz ist, sonst darunter.
  const rateSize = Math.max(9, Math.min(13, r * 0.36));
  ctx.font = `600 ${rateSize}px ${theme.fontMono}`;
  const rateY = inside ? y + r * 0.5 : y + r + rateSize * 0.9;
  const rate = `+${growth}`;
  ctx.lineWidth = 2.5;
  ctx.strokeText(rate, x, rateY);
  ctx.fillStyle = rgba(mix(color, WHITE, 0.55), owner === 0 ? 0.75 : 1);
  ctx.fillText(rate, x, rateY);
}

function drawFleets(ctx: CanvasRenderingContext2D, layout: Layout, theme: ArenaTheme, fleets: Fleet[], pos: number): void {
  // Bei sehr vielen Flotten nur die größeren beschriften, sonst liest man nichts mehr.
  const labelFrom = fleets.length > 70 ? 15 : fleets.length > 40 ? 6 : 0;
  ctx.lineCap = "round";
  for (const fleet of fleets) {
    const p = path(layout, fleet);
    const u = progress(fleet, pos);
    // Zwei Flotten auf derselben Strecke in Gegenrichtung fliegen aneinander vorbei statt durcheinander.
    const side = 3;
    const x = p.ax + (p.bx - p.ax) * u - p.uy * side;
    const y = p.ay + (p.by - p.ay) * u + p.ux * side;
    const size = Math.min(15, 4.5 + 1.55 * Math.log2(fleet.ships + 1));
    const color = theme.owner[fleet.owner];

    const tail = Math.min(size * 3.2, Math.hypot(x - p.ax, y - p.ay));
    if (tail > 1) {
      const trail = ctx.createLinearGradient(x - p.ux * tail, y - p.uy * tail, x, y);
      trail.addColorStop(0, rgba(color, 0));
      trail.addColorStop(1, rgba(color, 0.75));
      ctx.strokeStyle = trail;
      ctx.lineWidth = Math.max(1.5, size * 0.3);
      ctx.beginPath();
      ctx.moveTo(x - p.ux * tail, y - p.uy * tail);
      ctx.lineTo(x - p.ux * size * 0.3, y - p.uy * size * 0.3);
      ctx.stroke();
    }

    // Pfeilspitze in Flugrichtung.
    const nx = -p.uy;
    const ny = p.ux;
    ctx.fillStyle = rgba(mix(color, WHITE, 0.25));
    ctx.strokeStyle = rgba(BLACK, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + p.ux * size, y + p.uy * size);
    ctx.lineTo(x - p.ux * size * 0.7 + nx * size * 0.62, y - p.uy * size * 0.7 + ny * size * 0.62);
    ctx.lineTo(x - p.ux * size * 0.3, y - p.uy * size * 0.3);
    ctx.lineTo(x - p.ux * size * 0.7 - nx * size * 0.62, y - p.uy * size * 0.7 - ny * size * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (fleet.ships >= labelFrom) {
      // Zahl seitlich neben die Bahn, immer auf die obere Seite.
      const flip = ny > 0 ? -1 : 1;
      const lx = x + nx * flip * (size * 0.62 + 9);
      const ly = y + ny * flip * (size * 0.62 + 9);
      ctx.font = `700 11px ${theme.fontMono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba(BLACK, 0.85);
      ctx.strokeText(String(fleet.ships), lx, ly);
      ctx.fillStyle = rgba(mix(color, WHITE, 0.45));
      ctx.fillText(String(fleet.ships), lx, ly);
    }
  }
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: Rgb, alpha: number, width: number): void {
  if (alpha <= 0.01 || radius <= 0) return;
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawEffects(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: ArenaTheme,
  events: PlanetEvent[],
  pos: number,
  span: number,
  layer: "below" | "above",
): void {
  for (const event of events) {
    const u = clamp01((pos - event.t) / span);
    if (u >= 1) continue;
    const x = layout.x[event.planet];
    const y = layout.y[event.planet];
    const r = layout.r[event.planet];
    const fade = 1 - u;
    const out = easeOut(u);

    if (event.kind === "reinforce") {
      if (layer === "above") ring(ctx, x, y, r + 3 + out * 9, theme.owner[event.after.owner], 0.6 * fade, 2);
      continue;
    }

    const capture = event.kind === "capture";
    // Farbe des Angreifers: bei einer Eroberung der neue Besitzer, sonst wer mit den meisten Schiffen kam.
    const attacker: Owner = capture
      ? event.after.owner
      : event.before.owner === 1
        ? 2
        : event.before.owner === 2
          ? 1
          : event.arrived[0] >= event.arrived[1]
            ? 1
            : 2;
    const color = theme.owner[attacker];
    const reach = capture ? 62 : 34;

    if (layer === "below") {
      // Schockwelle unter den Planeten, damit die Zahlen lesbar bleiben.
      const wave = ctx.createRadialGradient(x, y, r, x, y, r + reach * out + 1);
      wave.addColorStop(0, rgba(color, 0));
      wave.addColorStop(0.75, rgba(color, (capture ? 0.3 : 0.18) * fade));
      wave.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = wave;
      ctx.beginPath();
      ctx.arc(x, y, r + reach * out + 1, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ring(ctx, x, y, r + reach * out, color, 0.9 * fade, 1 + 3 * fade);
    if (capture) {
      const late = clamp01((u - 0.22) / 0.78);
      if (late > 0) ring(ctx, x, y, r + reach * 0.8 * easeOut(late), WHITE, 0.55 * (1 - late), 1.5);
    }

    // Aufblitzen direkt beim Einschlag.
    const flash = fade * fade * fade;
    if (flash > 0.02) {
      ctx.fillStyle = rgba(capture ? mix(color, WHITE, 0.5) : WHITE, (capture ? 0.55 : 0.35) * flash);
      ctx.beginPath();
      ctx.arc(x, y, r + 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Funken, je Ereignis immer dieselben.
    const sparks = capture ? 16 : 9;
    ctx.lineCap = "round";
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(mix(color, WHITE, 0.4), 0.9 * fade);
    ctx.beginPath();
    for (let k = 0; k < sparks; k++) {
      const angle = hash(event.t, event.planet, k) * Math.PI * 2;
      const far = r + (reach * (0.45 + 0.7 * hash(event.planet, k, event.t))) * out;
      const near = far - (4 + 7 * fade);
      ctx.moveTo(x + Math.cos(angle) * near, y + Math.sin(angle) * near);
      ctx.lineTo(x + Math.cos(angle) * far, y + Math.sin(angle) * far);
    }
    ctx.stroke();
  }
}
