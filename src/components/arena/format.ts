import type { MatchMeta, Owner, ResultReason } from "@/lib/viewer/model";

const REASON_TEXT: Record<ResultReason, string> = {
  elimination: "Gegner ausgelöscht",
  ships: "Tick-Limit erreicht, mehr Schiffe",
  growth: "Tick-Limit erreicht, gleich viele Schiffe, höhere Produktion",
  draw: "Gleichstand in allem",
  aborted: "Das Match wurde abgebrochen",
  unknown: "",
};

export function reasonText(reason: ResultReason): string {
  return REASON_TEXT[reason];
}

/** Dauer als `m:ss`. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const number = new Intl.NumberFormat("de-DE");

export function ownerName(meta: MatchMeta, owner: Owner): string {
  return owner === 0 ? "Neutral" : meta.players[owner - 1].name;
}

/** Textfarbe je Besitzer als Tailwind-Klasse. */
export const OWNER_TEXT = ["text-neutral", "text-p1", "text-p2"] as const;
export const OWNER_BG = ["bg-neutral", "bg-p1", "bg-p2"] as const;
