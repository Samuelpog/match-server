/**
 * Zeitplan einer Runde in der Ansicht. Alle Werte sind Anteile der Runde von
 * 0 bis 1. Die Auflösung folgt der Reihenfolge der Regeln: Befehle, Bewegung,
 * Kampf auf der Route, Ankunft, Ergebnis. Alles hängt am Abspielkopf, nicht
 * an der Uhr: wer pausiert, friert es ein, wer zurückspult, sieht es noch einmal.
 */
export const TIMING = {
  /** Neue Flotten erscheinen am Startplaneten. */
  launchFrom: 0.05,
  launchTo: 0.14,
  moveFrom: 0.16,
  moveTo: 0.6,
  /** Einschlag eines Kampfs auf der Route. */
  routeHit: 0.61,
  /** Ab hier zeigen die Flotten ihre Stärke nach dem Kampf. */
  routeSettle: 0.65,
  routeEnd: 0.78,
  /** Überlebende eines Kampfs auf der Route ziehen weiter. */
  resumeFrom: 0.66,
  resumeTo: 0.74,
  /** Einschlag am Planeten. */
  arriveHit: 0.75,
  /** Ab hier zeigen die Planeten den neuen Stand. */
  planetSettle: 0.77,
  /** Planeten ohne Ankunft bekommen hier ihre Produktion. */
  production: 0.9,
} as const;

export type Phase = "orders" | "move" | "fight" | "result";

export function phaseOf(fraction: number): Phase {
  if (fraction < TIMING.moveFrom) return "orders";
  if (fraction < TIMING.moveTo) return "move";
  if (fraction < TIMING.production) return "fight";
  return "result";
}

export const PHASE_LABEL: Record<Phase, string> = {
  orders: "Befehle",
  move: "Bewegung",
  fight: "Kampf",
  result: "Ergebnis",
};
