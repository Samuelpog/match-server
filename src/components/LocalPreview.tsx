"use client";

import { useMemo, useState } from "react";
import { replayFile } from "@/lib/arena/replay-file-v2";
import { BUILTIN_BOTS, DEMO_BOTS, generateMap, getBuiltinBot, simulate } from "@/lib/game";
import { controllerFromReplay } from "@/lib/viewer/session";
import { Arena } from "./arena/Arena";

/**
 * Spielt ein Match zwischen zwei eingebauten Bots vollständig im Browser und
 * zeigt es als Replay. Braucht keinen Server: gut, um die Ansicht vorzuführen,
 * wenn der Server schläft, und um Karten und Bots auszuprobieren.
 */
export function LocalPreview() {
  const [seed, setSeed] = useState(2026);
  const [bots, setBots] = useState<[string, string]>(DEMO_BOTS);
  const [planets, setPlanets] = useState(15);

  const controller = useMemo(() => {
    const map = generateMap({ seed, planets });
    const players = bots.map((id) => getBuiltinBot(id) ?? BUILTIN_BOTS[0]);
    const simulation = simulate({ map, bots: [players[0].play, players[1].play] });
    return controllerFromReplay(
      replayFile({
        id: `lokal-${seed}`,
        map,
        frames: simulation.frames,
        result: simulation.result,
        names: [players[0].name, players[1].name],
        bots: [players[0].id, players[1].id],
        options: { rounds: 120 },
        label: "Vorschau im Browser",
      }),
    );
  }, [seed, bots, planets]);

  return (
    <div className="flex flex-col gap-2">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col">
          <span className="label">Vorschau ohne Server</span>
          <h1 className="text-lg font-semibold">Zwei eingebaute Bots, im Browser gerechnet</h1>
        </div>
        <form className="flex flex-wrap items-end gap-1" onSubmit={(event) => event.preventDefault()}>
          {([0, 1] as const).map((seat) => (
            <label key={seat} className="flex flex-col">
              <span className="label">Spieler {seat + 1}</span>
              <select
                value={bots[seat]}
                onChange={(event) =>
                  setBots(seat === 0 ? [event.target.value, bots[1]] : [bots[0], event.target.value])
                }
                className="h-5 border border-line bg-surface px-1"
              >
                {BUILTIN_BOTS.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col">
            <span className="label">Planeten</span>
            <select
              value={planets}
              onChange={(event) => setPlanets(Number(event.target.value))}
              className="h-5 border border-line bg-surface px-1"
            >
              <option value={15}>15</option>
              <option value={17}>17</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
            className="h-5 border border-line px-2 hover:border-ink"
          >
            Neue Karte
          </button>
        </form>
      </header>
      <Arena key={controller.meta.id + bots.join() + planets} controller={controller} />
    </div>
  );
}
