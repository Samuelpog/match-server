import type { ReplayBuffer, Track, Transition } from "../buffer";
import type { Frame, Owner, Params, PlanetDef, PlanetEvent, PlanetState, Player, RouteBattle } from "../model";
import { TIMING } from "../phases";
import type { Layout } from "./layout";
import type { Starfield } from "./starfield";
import { mix, rgba, WHITE, type ArenaTheme, type Rgb } from "./theme";

export interface Scene {
  buffer: ReplayBuffer;
  /** Position des Abspielkopfs in Runden. */
  pos: number;
  params: Params;
  /** Uhrzeit in Millisekunden, nur für das Funkeln der Sterne. */
  now: number;
  reducedMotion: boolean;
  /** Hervorgehobener Planet (Maus oder Tastatur), sonst `-1`. */
  highlight: number;
}

const BLACK: Rgb = [3, 5, 10];

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u);
const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
/** Anteil von 0 bis 1, den `f` im Abschnitt von `from` bis `to` zurückgelegt hat. */
const within = (f: number, from: number, to: number) => clamp01((f - from) / (to - from));

/** Gleichbleibende Pseudo-Zufallszahl in [0, 1) aus drei ganzen Zahlen. */
function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Zeichnet ein vollständiges Bild der Schlacht. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: ArenaTheme,
  stars: Starfield,
  scene: Scene,
): void {
  const { buffer } = scene;
  const { width, height } = layout;

  ctx.drawImage(stars.image, 0, 0, width, height);
  if (!scene.reducedMotion) drawTwinkle(ctx, stars, scene.now);

  const last = buffer.lastRound;
  if (last < 0) return;
  const pos = Math.min(last, Math.max(0, scene.pos));
  const base = Math.min(last, Math.floor(pos + 1e-9));
  const previous = buffer.frames[base];
  const fraction = pos - base;
  // Zwischen zwei Runden läuft die Auflösung der nächsten. Steht der Abspielkopf auf einer Runde, steht das Bild.
  const transition = fraction > 1e-6 && base < last ? buffer.transitions[base + 1] : null;
  const next = transition ? buffer.frames[base + 1] : previous;

  drawRoutes(ctx, layout, theme, buffer);
  if (transition) drawOrders(ctx, layout, theme, transition, fraction);
  if (transition) drawPlanetEffects(ctx, layout, theme, transition.planetEvents, fraction, "below");

  const planets = buffer.map.planets;
  for (let i = 0; i < planets.length; i++) {
    const shown = transition ? planetDuring(previous, next, transition, i, fraction) : { state: previous.planets[i], blend: null };
    let color = theme.owner[shown.state.owner];
    if (shown.blend) color = mix(theme.owner[shown.blend.from], theme.owner[shown.blend.to], easeOut(shown.blend.u));
    drawPlanet(ctx, layout, theme, i, planets[i], shown.state, color, scene.highlight === i);
  }

  if (transition) {
    for (const track of transition.tracks) drawTrack(ctx, layout, theme, track, fraction);
    for (const battle of transition.routeBattles) drawRouteBattle(ctx, layout, theme, buffer, battle, fraction);
    drawPlanetEffects(ctx, layout, theme, transition.planetEvents, fraction, "above");
  } else {
    for (const fleet of previous.fleets) {
      drawFleet(ctx, layout, theme, fleet.from, fleet.to, fleet.progress / fleet.length, fleet.owner, fleet.ships, fleet.supply, 1, 1);
    }
  }
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

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Einheitsvektor von `a` nach `b`. */
  ux: number;
  uy: number;
}

/** Strecke zwischen zwei Planeten, von Rand zu Rand, mit etwas Luft für die Markierungen. */
function segment(layout: Layout, from: number, to: number): Segment {
  const dx = layout.x[to] - layout.x[from];
  const dy = layout.y[to] - layout.y[from];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const gap = 5 * layout.unit;
  // Sehr nahe Planeten: nie mehr Rand abziehen, als Strecke da ist.
  const inset = Math.min(1, (length * 0.8) / (layout.r[from] + layout.r[to] + 2 * gap));
  return {
    ax: layout.x[from] + ux * (layout.r[from] + gap) * inset,
    ay: layout.y[from] + uy * (layout.r[from] + gap) * inset,
    bx: layout.x[to] - ux * (layout.r[to] + gap) * inset,
    by: layout.y[to] - uy * (layout.r[to] + gap) * inset,
    ux,
    uy,
  };
}

/** Das Netz der Routen. Punkte auf der Linie teilen sie in Runden: eine Route mit zwei Punkten dauert drei Runden. */
function drawRoutes(ctx: CanvasRenderingContext2D, layout: Layout, theme: ArenaTheme, buffer: ReplayBuffer): void {
  ctx.lineCap = "round";
  for (const route of buffer.map.routes) {
    const s = segment(layout, route.a, route.b);
    ctx.strokeStyle = rgba(theme.muted, 0.34);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(s.ax, s.ay);
    ctx.lineTo(s.bx, s.by);
    ctx.stroke();
    ctx.fillStyle = rgba(theme.muted, 0.75);
    for (let k = 1; k < route.length; k++) {
      const u = k / route.length;
      ctx.beginPath();
      ctx.arc(s.ax + (s.bx - s.ax) * u, s.ay + (s.by - s.ay) * u, 2 * layout.unit, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Zu Beginn der Runde leuchten die Routen auf, über die gerade Flotten losgeschickt werden. */
function drawOrders(ctx: CanvasRenderingContext2D, layout: Layout, theme: ArenaTheme, transition: Transition, f: number): void {
  if (f >= TIMING.moveFrom + 0.06) return;
  const alpha = Math.min(within(f, 0, TIMING.launchFrom), 1 - within(f, TIMING.launchTo, TIMING.moveFrom + 0.06));
  if (alpha <= 0.01) return;
  ctx.lineCap = "round";
  for (const track of transition.tracks) {
    if (!track.launched || track.supply) continue;
    const s = segment(layout, track.from, track.to);
    const stroke = ctx.createLinearGradient(s.ax, s.ay, s.bx, s.by);
    stroke.addColorStop(0, rgba(theme.owner[track.owner], 0.85 * alpha));
    stroke.addColorStop(1, rgba(theme.owner[track.owner], 0.15 * alpha));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3.5 * layout.unit;
    ctx.beginPath();
    ctx.moveTo(s.ax, s.ay);
    ctx.lineTo(s.bx, s.by);
    ctx.stroke();
  }
}

interface ShownPlanet {
  state: PlanetState;
  /** Läuft gerade ein Besitzerwechsel: von welcher zu welcher Farbe und wie weit. */
  blend: { from: Owner; to: Owner; u: number } | null;
}

const shownScratch: PlanetState = { owner: 0, ships: 0, building: null, supply: null };

/** Stand eines Planeten mitten in der Auflösung einer Runde. */
function planetDuring(previous: Frame, next: Frame, transition: Transition, planet: number, f: number): ShownPlanet {
  const before = previous.planets[planet];
  const after = next.planets[planet];
  let event: PlanetEvent | null = null;
  for (const candidate of transition.planetEvents) if (candidate.planet === planet) event = candidate;

  const settle = event ? TIMING.planetSettle : TIMING.production;
  if (f >= settle) {
    const captured = event && event.kind === "capture";
    const u = captured ? within(f, TIMING.planetSettle, TIMING.planetSettle + 0.16) : 1;
    return { state: after, blend: captured && u < 1 ? { from: event!.before.owner, to: event!.after.owner, u } : null };
  }
  // Was losgeschickt wurde, fehlt auf dem Planeten, sobald die Flotte daneben erscheint.
  const gone = f >= TIMING.launchFrom ? (transition.launched.get(planet) ?? 0) : 0;
  if (gone === 0) return { state: before, blend: null };
  shownScratch.owner = before.owner;
  shownScratch.ships = Math.max(0, before.ships - gone);
  shownScratch.building = before.building;
  shownScratch.supply = before.supply;
  return { state: shownScratch, blend: null };
}

function drawPlanet(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: ArenaTheme,
  index: number,
  def: PlanetDef,
  state: PlanetState,
  color: Rgb,
  highlight: boolean,
): void {
  const x = layout.x[index];
  const y = layout.y[index];
  const r = layout.r[index];
  const owner = state.owner;

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

  if (def.home !== 0) drawHomeMark(ctx, theme, x, y, r, def.home);
  if (def.hub) drawHubMark(ctx, theme, x, y, r);

  if (highlight) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(theme.ink, 0.9);
    ctx.beginPath();
    ctx.arc(x, y, r + 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  const digits = String(state.ships).length;
  const inside = r >= 17;
  const size = Math.max(10, Math.min(24, r * (digits >= 4 ? 0.5 : digits === 3 ? 0.6 : 0.72)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px ${theme.fontMono}`;
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(BLACK, 0.7);
  const shipsY = inside ? y - r * 0.14 : y;
  ctx.strokeText(String(state.ships), x, shipsY);
  ctx.fillStyle = rgba(theme.ink);
  ctx.fillText(String(state.ships), x, shipsY);

  // Produktionsrate: im Planeten, wenn Platz ist, sonst rechts daneben.
  const rateSize = Math.max(9, Math.min(12, r * 0.36));
  ctx.font = `600 ${rateSize}px ${theme.fontMono}`;
  const rate = `+${def.growth}`;
  ctx.lineWidth = 2.5;
  ctx.fillStyle = rgba(mix(color, WHITE, 0.55), owner === 0 ? 0.75 : 1);
  if (inside) {
    ctx.strokeText(rate, x, y + r * 0.5);
    ctx.fillText(rate, x, y + r * 0.5);
  } else {
    ctx.textAlign = "left";
    ctx.strokeText(rate, x + r + 4, y);
    ctx.fillText(rate, x + r + 4, y);
    ctx.textAlign = "center";
  }

  // Name unter dem Planeten.
  const nameSize = Math.max(9.5, Math.min(12, 11 * layout.unit));
  const nameY = y + r + (def.home !== 0 || def.hub ? 9 : 5) + nameSize * 0.6;
  ctx.font = `600 ${nameSize}px ${theme.fontSans}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(BLACK, 0.8);
  ctx.strokeText(def.name, x, nameY);
  ctx.fillStyle = rgba(mix(theme.muted, theme.ink, owner === 0 ? 0.25 : 0.6));
  ctx.fillText(def.name, x, nameY);
}

/** Heimatplanet: ein zweiter Ring in der Farbe des Spielers, dem er zu Beginn gehört, mit einem Wimpel obenauf. */
function drawHomeMark(ctx: CanvasRenderingContext2D, theme: ArenaTheme, x: number, y: number, r: number, home: Owner): void {
  const color = theme.owner[home];
  ctx.strokeStyle = rgba(color, 0.9);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r + 4.5, 0, Math.PI * 2);
  ctx.stroke();
  const top = y - r - 4.5;
  ctx.fillStyle = rgba(mix(color, WHITE, 0.2));
  ctx.strokeStyle = rgba(BLACK, 0.8);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, top - 9);
  ctx.lineTo(x + 6, top - 2);
  ctx.lineTo(x, top + 1.5);
  ctx.lineTo(x - 6, top - 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Knotenplanet: vier kleine Rauten um den Planeten. */
function drawHubMark(ctx: CanvasRenderingContext2D, theme: ArenaTheme, x: number, y: number, r: number): void {
  const d = r + 6;
  const s = 3;
  ctx.fillStyle = rgba(theme.ink, 0.85);
  for (const [ox, oy] of [
    [0, -d],
    [d, 0],
    [0, d],
    [-d, 0],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x + ox, y + oy - s);
    ctx.lineTo(x + ox + s, y + oy);
    ctx.lineTo(x + ox, y + oy + s);
    ctx.lineTo(x + ox - s, y + oy);
    ctx.closePath();
    ctx.fill();
  }
}

/** Eine Flotte auf ihrem Weg durch die laufende Runde. */
function drawTrack(ctx: CanvasRenderingContext2D, layout: Layout, theme: ArenaTheme, track: Track, f: number): void {
  let alpha = 1;
  let scale = 1;
  if (track.launched) {
    if (f < TIMING.launchFrom) return;
    scale = easeOut(within(f, TIMING.launchFrom, TIMING.launchTo));
  }

  const move = easeInOut(within(f, TIMING.moveFrom, TIMING.moveTo));
  const battle = track.battles[0];
  let at: number;
  let ships = track.ships;
  if (battle) {
    // Bis zum Treffpunkt ziehen, kämpfen, danach mit dem Rest weiter.
    const meet = Math.min(Math.max(battle.at, Math.min(track.start, track.end)), Math.max(track.start, track.end));
    at = track.start + (meet - track.start) * move;
    if (f >= TIMING.routeSettle) ships = track.shipsAfter;
    if (track.shipsAfter <= 0) {
      alpha = 1 - within(f, TIMING.routeSettle, TIMING.routeEnd - 0.04);
    } else if (f >= TIMING.resumeFrom) {
      at = meet + (track.end - meet) * easeInOut(within(f, TIMING.resumeFrom, TIMING.resumeTo));
    }
  } else {
    at = track.start + (track.end - track.start) * move;
  }
  // Am Ziel geht die Flotte im Planeten auf.
  if (track.arrives && track.shipsAfter > 0) alpha *= 1 - within(f, TIMING.arriveHit - 0.01, TIMING.planetSettle + 0.01);
  if (alpha <= 0.01 || ships <= 0) return;

  drawFleet(ctx, layout, theme, track.from, track.to, at / track.length, track.owner, ships, track.supply, alpha, scale);
}

/** Pfeilspitze in Flugrichtung mit Schweif und Schiffszahl. `u` ist der Anteil des Wegs von Rand zu Rand. */
function drawFleet(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: ArenaTheme,
  from: number,
  to: number,
  u: number,
  owner: Player,
  ships: number,
  supply: boolean,
  alpha: number,
  scale: number,
): void {
  const s = segment(layout, from, to);
  // Rechtsverkehr: Flotten in Gegenrichtung stehen sich gegenüber statt ineinander.
  const side = 4 * layout.unit;
  const x = s.ax + (s.bx - s.ax) * u - s.uy * side;
  const y = s.ay + (s.by - s.ay) * u + s.ux * side;
  const size = Math.min(14, (supply ? 3.5 : 5) + 1.5 * Math.log2(ships + 1)) * layout.unit * (0.4 + 0.6 * scale);
  const color = theme.owner[owner];

  ctx.lineCap = "round";
  const tail = Math.min(size * 2.6, Math.hypot(x - s.ax, y - s.ay));
  if (tail > 2) {
    const trail = ctx.createLinearGradient(x - s.ux * tail, y - s.uy * tail, x, y);
    trail.addColorStop(0, rgba(color, 0));
    trail.addColorStop(1, rgba(color, 0.7 * alpha));
    ctx.strokeStyle = trail;
    ctx.lineWidth = Math.max(1.5, size * 0.3);
    ctx.beginPath();
    ctx.moveTo(x - s.ux * tail, y - s.uy * tail);
    ctx.lineTo(x - s.ux * size * 0.3, y - s.uy * size * 0.3);
    ctx.stroke();
  }

  const nx = -s.uy;
  const ny = s.ux;
  ctx.fillStyle = rgba(mix(color, WHITE, 0.25), alpha);
  ctx.strokeStyle = rgba(BLACK, 0.8 * alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + s.ux * size, y + s.uy * size);
  ctx.lineTo(x - s.ux * size * 0.7 + nx * size * 0.62, y - s.uy * size * 0.7 + ny * size * 0.62);
  ctx.lineTo(x - s.ux * size * 0.3, y - s.uy * size * 0.3);
  ctx.lineTo(x - s.ux * size * 0.7 - nx * size * 0.62, y - s.uy * size * 0.7 - ny * size * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (supply) return;
  // Zahl auf der Außenseite der Bahn, damit sich die Zahlen zweier Gegner nicht decken.
  const text = Math.max(10, Math.round(12 * layout.unit));
  const lx = x - nx * (size * 0.62 + text * 0.75);
  const ly = y - ny * (size * 0.62 + text * 0.75);
  ctx.font = `700 ${text}px ${theme.fontMono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(BLACK, 0.85 * alpha);
  ctx.strokeText(String(ships), lx, ly);
  ctx.fillStyle = rgba(mix(color, WHITE, 0.45), alpha);
  ctx.fillText(String(ships), lx, ly);
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: Rgb, alpha: number, width: number): void {
  if (alpha <= 0.01 || radius <= 0) return;
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

/** Zweikampf auf der Route: Aufblitzen am Treffpunkt, Funken in den Farben beider Seiten. */
function drawRouteBattle(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: ArenaTheme,
  buffer: ReplayBuffer,
  battle: RouteBattle,
  f: number,
): void {
  if (f < TIMING.routeHit) return;
  const u = within(f, TIMING.routeHit, TIMING.routeEnd + 0.06);
  if (u >= 1) return;
  const s = segment(layout, battle.a, battle.b);
  const along = battle.at / buffer.lengthOf(battle.a, battle.b);
  const x = s.ax + (s.bx - s.ax) * along;
  const y = s.ay + (s.by - s.ay) * along;
  const fade = 1 - u;
  const out = easeOut(u);
  const reach = 26 * layout.unit;

  const flash = fade * fade * fade;
  ctx.fillStyle = rgba(WHITE, 0.75 * flash);
  ctx.beginPath();
  ctx.arc(x, y, 5 * layout.unit + reach * 0.35 * out, 0, Math.PI * 2);
  ctx.fill();
  ring(ctx, x, y, 4 + reach * out, WHITE, 0.7 * fade, 1 + 2 * fade);

  ctx.lineCap = "round";
  ctx.lineWidth = 1.5;
  battle.fleets.forEach((fleet, index) => {
    ctx.strokeStyle = rgba(mix(theme.owner[fleet.owner], WHITE, 0.3), 0.95 * fade);
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const angle = hash(battle.round * 31 + battle.a, battle.b * 17 + index, k) * Math.PI * 2;
      const far = 4 + reach * (0.5 + 0.7 * hash(battle.b, k, battle.round + index)) * out;
      const near = far - (3 + 6 * fade);
      ctx.moveTo(x + Math.cos(angle) * near, y + Math.sin(angle) * near);
      ctx.lineTo(x + Math.cos(angle) * far, y + Math.sin(angle) * far);
    }
    ctx.stroke();
  });
}

function drawPlanetEffects(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: ArenaTheme,
  events: PlanetEvent[],
  f: number,
  layer: "below" | "above",
): void {
  if (f < TIMING.arriveHit) return;
  const u = within(f, TIMING.arriveHit, 1);
  if (u >= 1) return;
  const fade = 1 - u;
  const out = easeOut(u);

  for (const event of events) {
    const x = layout.x[event.planet];
    const y = layout.y[event.planet];
    const r = layout.r[event.planet];

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
    const reach = (capture ? 58 : 32) * layout.unit;

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
      const angle = hash(event.round, event.planet, k) * Math.PI * 2;
      const far = r + reach * (0.45 + 0.7 * hash(event.planet, k, event.round)) * out;
      const near = far - (4 + 7 * fade);
      ctx.moveTo(x + Math.cos(angle) * near, y + Math.sin(angle) * near);
      ctx.lineTo(x + Math.cos(angle) * far, y + Math.sin(angle) * far);
    }
    ctx.stroke();
  }
}
