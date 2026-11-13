"use client";

import type { ArenaController } from "@/lib/viewer/controller";
import type { MatchMeta, PlanetEvent } from "@/lib/viewer/model";
import { number, ownerName, OWNER_TEXT } from "./format";
import { OwnerMark } from "./OwnerMark";
import { useMeta, usePlayback } from "./use-playback";

const SHOWN = 7;

function describe(meta: MatchMeta, event: PlanetEvent, planetId: string | number): React.ReactNode {
  const total = event.arrived[0] + event.arrived[1];
  if (event.kind === "capture") {
    return (
      <>
        <span className={`font-semibold ${OWNER_TEXT[event.after.owner]}`}>{ownerName(meta, event.after.owner)}</span>{" "}
        erobert Planet {planetId} von{" "}
        <span className={OWNER_TEXT[event.before.owner]}>{ownerName(meta, event.before.owner)}</span>
        <span className="text-muted">
          {" "}
          ({number.format(total)} gegen {number.format(event.before.ships)})
        </span>
      </>
    );
  }
  return (
    <>
      <span className={`font-semibold ${OWNER_TEXT[event.after.owner]}`}>{ownerName(meta, event.after.owner)}</span> hält
      Planet {planetId}
      <span className="text-muted">
        {" "}
        ({number.format(total)} Angreifer, {number.format(event.after.ships)} bleiben)
      </span>
    </>
  );
}

/** Die letzten Kämpfe bis zum angezeigten Tick, neueste oben. Verstärkungen stehen hier nicht. */
export function EventFeed({ controller }: { controller: ArenaController }) {
  const meta = useMeta(controller);
  const { tick } = usePlayback(controller);
  const { buffer } = controller;

  const recent: PlanetEvent[] = [];
  for (let t = Math.min(tick, buffer.lastTick); t >= 1 && recent.length < SHOWN; t--) {
    for (const event of buffer.events[t]) {
      if (event.kind !== "reinforce" && recent.length < SHOWN) recent.push(event);
    }
  }

  return (
    <section aria-labelledby="gefechte-titel" className="flex min-h-0 flex-col gap-0.5 border border-line bg-surface p-1.5 sm:p-2">
      <h2 id="gefechte-titel" className="label">
        Gefechte
      </h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted">Noch kein Kampf. Sobald eine Flotte einen fremden Planeten erreicht, steht es hier.</p>
      ) : (
        <ol className="flex flex-col">
          {recent.map((event) => (
            <li
              key={`${event.t}-${event.planet}`}
              className="grid grid-cols-[3rem_1rem_minmax(0,1fr)] items-start gap-x-0.5 border-t border-line py-0.5 text-sm first:border-t-0"
            >
              <button
                type="button"
                onClick={() => controller.seek(Math.max(0, event.t - 2))}
                title="Zu diesem Moment springen"
                className="tabular text-left text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                T{event.t}
              </button>
              <span className="pt-0.5">
                <OwnerMark owner={event.after.owner} size={12} />
              </span>
              <span>{describe(meta, event, buffer.map.planets[event.planet].id)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
