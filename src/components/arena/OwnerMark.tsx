import type { Owner } from "@/lib/viewer/model";

const STROKE = ["var(--color-neutral)", "var(--color-p1)", "var(--color-p2)"] as const;
const DASH = ["1.5 3", undefined, "5 2.4"] as const;

/**
 * Kleines Zeichen für einen Besitzer, mit demselben Rand wie die Planeten auf
 * der Karte: durchgezogen (Spieler 1), gestrichelt (Spieler 2), gepunktet
 * (neutral). So bleibt die Zuordnung auch ohne Farbe erkennbar.
 */
export function OwnerMark({ owner, size = 16 }: { owner: Owner; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="6" fill={STROKE[owner]} fillOpacity={owner === 0 ? 0.15 : 0.3} />
      <circle cx="8" cy="8" r="6" fill="none" stroke={STROKE[owner]} strokeWidth="2" strokeDasharray={DASH[owner]} />
    </svg>
  );
}
