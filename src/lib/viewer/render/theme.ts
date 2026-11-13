import type { Owner } from "../model";

export type Rgb = readonly [number, number, number];

/** Farben der Zeichenfläche. Kommen aus den Design-Tokens in `globals.css`. */
export interface ArenaTheme {
  space: Rgb;
  ink: Rgb;
  muted: Rgb;
  /** Index = Besitzer: 0 neutral, 1 Spieler 1, 2 Spieler 2. */
  owner: readonly [Rgb, Rgb, Rgb];
  fontSans: string;
  fontMono: string;
}

export const FALLBACK_THEME: ArenaTheme = {
  space: [5, 8, 15],
  ink: [232, 238, 247],
  muted: [138, 151, 171],
  owner: [
    [139, 147, 163],
    [56, 189, 248],
    [251, 146, 60],
  ],
  fontSans: "ui-sans-serif, system-ui, sans-serif",
  fontMono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};

function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16)) as unknown as Rgb;
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
  }
  return null;
}

/** Liest die Farbrollen vom Element. Fehlt eine oder ist sie kein Hex-Wert, gilt der Rückfallwert. */
export function readTheme(element: Element): ArenaTheme {
  const style = getComputedStyle(element);
  const color = (name: string, fallback: Rgb) => parseHex(style.getPropertyValue(name)) ?? fallback;
  const font = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    space: color("--color-space", FALLBACK_THEME.space),
    ink: color("--color-ink", FALLBACK_THEME.ink),
    muted: color("--color-muted", FALLBACK_THEME.muted),
    owner: [
      color("--color-neutral", FALLBACK_THEME.owner[0]),
      color("--color-p1", FALLBACK_THEME.owner[1]),
      color("--color-p2", FALLBACK_THEME.owner[2]),
    ],
    fontSans: font("--font-sans", FALLBACK_THEME.fontSans),
    fontMono: font("--font-mono", FALLBACK_THEME.fontMono),
  };
}

export function rgba(color: Rgb, alpha = 1): string {
  return `rgba(${color[0] | 0},${color[1] | 0},${color[2] | 0},${alpha})`;
}

/** Mischt zwei Farben. `t = 0` ergibt `a`, `t = 1` ergibt `b`. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function ownerColor(theme: ArenaTheme, owner: Owner): Rgb {
  return theme.owner[owner];
}

export const WHITE: Rgb = [255, 255, 255];
