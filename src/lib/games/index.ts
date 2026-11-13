import type { GameModule } from "@/lib/match/types";
import { placeholder } from "./placeholder";

/**
 * Alle Spiele, die der Server kennt. Ein neues Spiel wird hier eingetragen
 * und ist danach über `POST /api/matches` mit `{ "game": "<id>" }` wählbar.
 */
const games: Record<string, GameModule> = {
  [placeholder.id]: placeholder as GameModule,
};

export const DEFAULT_GAME = placeholder.id;

export function getGame(id: string): GameModule | null {
  return Object.hasOwn(games, id) ? games[id] : null;
}

export function listGames(): { id: string; name: string; seats: number }[] {
  return Object.values(games).map(({ id, name, seats }) => ({ id, name, seats }));
}
