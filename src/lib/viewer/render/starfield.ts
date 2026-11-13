import { rgba, type ArenaTheme, type Rgb } from "./theme";

/** Zufall mit festem Startwert, damit der Himmel bei jedem Neuzeichnen derselbe ist. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Twinkler {
  x: number;
  y: number;
  size: number;
  phase: number;
  period: number;
}

export interface Starfield {
  image: HTMLCanvasElement;
  /** Wenige Sterne, die über dem festen Bild funkeln. */
  twinklers: Twinkler[];
}

const NEBULAE: readonly Rgb[] = [
  [40, 90, 160],
  [90, 50, 140],
  [20, 110, 120],
];

/**
 * Malt den Hintergrund einmal in ein eigenes Bild: Verlauf, Nebel, Sterne.
 * Je Bild der Animation wird dann nur dieses fertige Bild kopiert.
 */
export function createStarfield(width: number, height: number, ratio: number, theme: ArenaTheme): Starfield {
  const image = document.createElement("canvas");
  image.width = Math.max(1, Math.round(width * ratio));
  image.height = Math.max(1, Math.round(height * ratio));
  const ctx = image.getContext("2d");
  const twinklers: Twinkler[] = [];
  if (!ctx) return { image, twinklers };
  ctx.scale(ratio, ratio);
  const random = seeded(20261113);

  ctx.fillStyle = rgba(theme.space);
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 5; i++) {
    const x = random() * width;
    const y = random() * height;
    const radius = (0.25 + random() * 0.35) * Math.max(width, height);
    const color = NEBULAE[i % NEBULAE.length];
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, rgba(color, 0.1 + random() * 0.06));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  const count = Math.round((width * height) / 1500);
  for (let i = 0; i < count; i++) {
    const x = random() * width;
    const y = random() * height;
    const depth = random();
    const size = depth > 0.97 ? 1.6 : depth > 0.8 ? 1.1 : 0.7;
    const tint: Rgb = random() > 0.8 ? [190, 210, 255] : random() > 0.9 ? [255, 225, 200] : [235, 240, 250];
    ctx.fillStyle = rgba(tint, 0.25 + depth * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (depth > 0.94 && twinklers.length < 48) {
      twinklers.push({ x, y, size: size + 0.6, phase: random() * Math.PI * 2, period: 1800 + random() * 3200 });
    }
  }

  // Zum Rand hin abdunkeln, damit die Karte in der Mitte trägt.
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.35,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  return { image, twinklers };
}
