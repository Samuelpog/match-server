"use client";

import type { ArenaController } from "@/lib/viewer/controller";
import type { ActionView, ArenaMap, Frame, GameEvent, MatchMeta, Player } from "@/lib/viewer/model";
import { BUILDING_NAME, number, ownerName, OWNER_TEXT, planetName, rejectText } from "./format";
import { OwnerMark } from "./OwnerMark";
import { useMeta, usePlayback } from "./use-playback";

/** So viele Runden stehen höchstens im Protokoll. Ältere erreicht man über die Zeitleiste. */
const SHOWN = 30;

function describeAction(map: ArenaMap, frame: Frame, action: ActionView): string {
  if (action.kind === "move") {
    const fleet = frame.fleets.find((candidate) => candidate.id === action.fleet);
    const arrival = action.ok && fleet ? `, Ankunft R${fleet.arrive}` : "";
    return `${action.ships ?? "?"} Schiffe ${planetName(map, action.from)} → ${planetName(map, action.to)}${arrival}`;
  }
  if (action.kind === "build") {
    return `Ausbau ${action.building ? BUILDING_NAME[action.building] : "?"} auf ${planetName(map, action.from)}`;
  }
  if (action.kind === "supply") {
    return action.to === null
      ? `Nachschublinie von ${planetName(map, action.from)} beendet`
      : `Nachschublinie ${planetName(map, action.from)} → ${planetName(map, action.to)}`;
  }
  return "Unlesbare Aktion";
}

function Actions({ map, frame, player }: { map: ArenaMap; frame: Frame; player: Player }) {
  const side = player - 1;
  const actions = frame.actions[side];
  const seat = frame.seats[side];
  return (
    <li className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-0.5">
      <span className="pt-0.5">
        <OwnerMark owner={player} size={12} />
      </span>
      {actions.length === 0 ? (
        <span className="text-muted">{seat.submitted === false ? "Frist verpasst, setzt aus" : "keine Aktion"}</span>
      ) : (
        <ul className="flex flex-col">
          {actions.map((action, index) => (
            <li key={index} className={action.ok ? "" : "text-muted"}>
              <span className={action.ok ? "" : "line-through"}>{describeAction(map, frame, action)}</span>
              {action.ok ? null : <span className="text-warn"> abgelehnt: {rejectText(action.code)}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function describeEvent(meta: MatchMeta, map: ArenaMap, event: GameEvent, supply: ReadonlySet<number>): React.ReactNode {
  if (event.kind === "route") {
    const convoy = event.fleets.some((fleet) => supply.has(fleet.id));
    const survivor = event.fleets.find((fleet) => fleet.after > 0);
    const where =
      event.at === 0
        ? `vor ${planetName(map, event.a)}`
        : event.at >= 1 && map.routes.some((route) => route.a === event.a && route.b === event.b && route.length === event.at)
          ? `vor ${planetName(map, event.b)}`
          : `zwischen ${planetName(map, event.a)} und ${planetName(map, event.b)}`;
    return (
      <>
        {convoy ? "Nachschub abgefangen" : "Kampf"} {where}: {event.fleets.map((fleet) => number.format(fleet.before)).join(" gegen ")}.{" "}
        {survivor ? (
          <>
            <span className={`font-semibold ${OWNER_TEXT[survivor.owner]}`}>{ownerName(meta, survivor.owner)}</span> behält{" "}
            {number.format(survivor.after)}
          </>
        ) : (
          "Beide Flotten vernichtet"
        )}
      </>
    );
  }
  if (event.kind === "built") {
    return (
      <>
        {BUILDING_NAME[event.building]} auf {planetName(map, event.planet)} ist fertig
      </>
    );
  }
  const attackers = event.before.owner === 0 ? event.arrived[0] + event.arrived[1] : event.arrived[2 - event.before.owner];
  if (event.kind === "capture") {
    return (
      <>
        <span className={`font-semibold ${OWNER_TEXT[event.after.owner]}`}>{ownerName(meta, event.after.owner)}</span> erobert{" "}
        {planetName(map, event.planet)} von <span className={OWNER_TEXT[event.before.owner]}>{ownerName(meta, event.before.owner)}</span>
        <span className="text-muted">
          {" "}
          ({number.format(attackers)} gegen {number.format(event.strength)}
          {event.destroyed ? `, ${BUILDING_NAME[event.destroyed]} zerstört` : ""})
        </span>
      </>
    );
  }
  return (
    <>
      <span className={`font-semibold ${OWNER_TEXT[event.after.owner]}`}>{ownerName(meta, event.after.owner)}</span> hält{" "}
      {planetName(map, event.planet)}
      <span className="text-muted">
        {" "}
        ({number.format(attackers)} gegen {number.format(event.strength)}, {number.format(event.after.ships)} bleiben)
      </span>
    </>
  );
}

/**
 * Rundenprotokoll: je Runde die Aktionen beider Seiten, auch abgelehnte, und
 * darunter Kämpfe und Eroberungen. Neueste Runde oben. Verstärkungen stehen
 * hier nicht, sie ergeben sich aus den Aktionen.
 */
export function RoundLog({ controller }: { controller: ArenaController }) {
  const meta = useMeta(controller);
  const { round: settled, showing } = usePlayback(controller);
  const { buffer } = controller;
  const map = buffer.map;

  const rounds: Frame[] = [];
  for (let round = Math.min(showing, buffer.lastRound); round >= 1 && rounds.length < SHOWN; round--) {
    rounds.push(buffer.frames[round]);
  }

  return (
    <section
      aria-labelledby="protokoll-titel"
      className="flex max-h-[420px] min-h-0 flex-col gap-0.5 border border-line bg-surface p-1.5 sm:p-2 xl:max-h-none"
    >
      <h2 id="protokoll-titel" className="label">
        Rundenprotokoll
      </h2>
      {rounds.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Runde gespielt. Hier steht, was jede Seite in jeder Runde befohlen hat.</p>
      ) : (
        <ol className="flex min-h-0 flex-col overflow-y-auto xl:max-h-[calc(74vh+110px)]">
          {rounds.map((frame) => {
            // Solange die Runde noch aufgelöst wird, stehen nur die Befehle da. Der Ausgang folgt, wenn man ihn gesehen hat.
            const events = frame.round <= settled ? frame.events.filter((event) => event.kind !== "reinforce") : [];
            const supply = new Set<number>();
            for (const track of buffer.transitions[frame.round]?.tracks ?? []) if (track.supply) supply.add(track.id);
            return (
              <li key={frame.round} className="border-t border-line py-0.5 text-sm first:border-t-0">
                <button
                  type="button"
                  onClick={() => {
                    controller.seek(frame.round - 1);
                    controller.play();
                  }}
                  title="Diese Runde noch einmal ansehen"
                  className={`tabular label underline-offset-2 hover:text-ink hover:underline ${frame.round === showing ? "text-ink" : ""}`}
                >
                  Runde {frame.round}
                </button>
                <ul className="flex flex-col gap-0.5">
                  <Actions map={map} frame={frame} player={1} />
                  <Actions map={map} frame={frame} player={2} />
                  {events.map((event, index) => (
                    <li key={index} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-0.5">
                      <span aria-hidden="true" className="text-center text-muted">
                        ✦
                      </span>
                      <span>{describeEvent(meta, map, event, supply)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
