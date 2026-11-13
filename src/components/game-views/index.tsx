import { createElement, type ComponentType } from "react";
import type { MatchView } from "@/lib/match/types";

export interface GameViewProps {
  match: MatchView;
}

/**
 * Platzhalter für das Spielfeld. Zeigt die Rohdaten, die das Spiel für
 * Zuschauer freigibt.
 */
function PlaceholderView({ match }: GameViewProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        Hier erscheint das Spielfeld, sobald das Spiel eingehängt ist. Bis dahin steht hier, was das Spiel für
        Zuschauer freigibt.
      </p>
      <pre className="overflow-x-auto border border-line bg-ground p-2 font-mono text-xs">
        {JSON.stringify(match.view, null, 2)}
      </pre>
    </div>
  );
}

/**
 * Darstellung je Spiel. Ein neues Spiel bekommt hier seine Komponente unter
 * derselben ID wie in `src/lib/games/index.ts`.
 */
const views: Record<string, ComponentType<GameViewProps>> = {};

function viewFor(gameId: string): ComponentType<GameViewProps> {
  return Object.hasOwn(views, gameId) ? views[gameId] : PlaceholderView;
}

export function GameView({ match }: GameViewProps) {
  return createElement(viewFor(match.game.id), { match });
}
