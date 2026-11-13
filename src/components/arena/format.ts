import type { ArenaMap, BuildingType, MatchMeta, Owner, ResultReason } from "@/lib/viewer/model";

const REASON_TEXT: Record<ResultReason, string> = {
  home: "Heimatplanet des Gegners erobert",
  points: "Mehr Punkte am Ende",
  ships: "Gleiche Punkte, mehr Schiffe",
  draw: "Gleichstand bei Punkten und Schiffen",
  aborted: "Das Match wurde abgebrochen",
  unknown: "",
};

export function reasonText(reason: ResultReason): string {
  return REASON_TEXT[reason];
}

export const BUILDING_NAME: Record<BuildingType, string> = {
  shipyard: "Werft",
  fortress: "Festung",
  command: "Kommandozentrale",
  radar: "Radar",
};

/** Warum der Server eine Aktion abgelehnt hat, in Worten. */
const REJECT_TEXT: Record<string, string> = {
  bad_action: "unlesbar",
  bad_planet: "unbekannter Planet",
  not_owner: "Planet gehört ihm nicht",
  no_route: "keine Route dorthin",
  bad_ships: "ungültige Schiffszahl",
  not_enough_ships: "zu wenige Schiffe",
  unknown_building: "unbekannter Ausbau",
  not_hub: "nur auf Knotenplaneten",
  slot_busy: "dort wird schon gebaut",
  not_available: "in dieser Stufe nicht möglich",
  action_limit: "Aktionslimit erreicht",
};

export function rejectText(code: string | null): string {
  return (code && REJECT_TEXT[code]) || "abgelehnt";
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

export function planetName(map: ArenaMap, planet: number | null): string {
  return (planet !== null && map.planets[planet]?.name) || "?";
}

/** Textfarbe je Besitzer als Tailwind-Klasse. */
export const OWNER_TEXT = ["text-neutral", "text-p1", "text-p2"] as const;
export const OWNER_BG = ["bg-neutral", "bg-p1", "bg-p2"] as const;
