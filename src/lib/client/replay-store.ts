import type { ReplayResponse } from "@/lib/arena/api-types";

/**
 * Beendete Matches im Browser. Der Server vergisst alles, sobald er einschläft
 * oder neu gebaut wird; was hier liegt, bleibt abspielbar. Gespeichert wird in
 * IndexedDB, in zwei Ablagen: die vollständigen Replays und eine kleine
 * Übersicht, damit die Liste nicht jedes Replay laden muss.
 */

const DB_NAME = "planetwars";
const REPLAYS = "replays";
const INDEX = "index";
const KEEP = 40;

export interface ReplaySummary {
  id: string;
  savedAt: number;
  names: [string, string];
  /** Sitz des Gewinners, `null` bei Unentschieden oder Abbruch. */
  winner: 0 | 1 | null;
  reason: string;
  ticks: number;
  label: string | null;
  series: { id: string; game: number } | null;
}

function summarize(replay: ReplayResponse): ReplaySummary {
  const { match } = replay;
  return {
    id: match.id,
    savedAt: Date.now(),
    names: [match.players[0].name ?? "Sitz 1", match.players[1].name ?? "Sitz 2"],
    winner: match.result?.winner ?? null,
    reason: match.result?.reason ?? "unknown",
    ticks: replay.frames.length - 1,
    label: match.label,
    series: match.series,
  };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(REPLAYS);
      request.result.createObjectStore(INDEX, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Der Speicher des Browsers ist nicht verfügbar."));
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Legt ein vollständiges Replay ab und räumt die ältesten weg, wenn es zu viele werden. */
export async function saveReplay(replay: ReplayResponse): Promise<void> {
  const db = await open();
  try {
    const transaction = db.transaction([REPLAYS, INDEX], "readwrite");
    const finished = done(transaction);
    const index = transaction.objectStore(INDEX);
    const replays = transaction.objectStore(REPLAYS);
    replays.put(replay, replay.match.id);
    index.put(summarize(replay));
    const all = await result(index.getAll() as IDBRequest<ReplaySummary[]>);
    for (const old of all.sort((a, b) => b.savedAt - a.savedAt).slice(KEEP)) {
      index.delete(old.id);
      replays.delete(old.id);
    }
    await finished;
  } finally {
    db.close();
  }
}

/** Übersicht aller abgelegten Replays, neueste zuerst. */
export async function listReplays(): Promise<ReplaySummary[]> {
  const db = await open();
  try {
    const all = await result(db.transaction(INDEX).objectStore(INDEX).getAll() as IDBRequest<ReplaySummary[]>);
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

export async function loadReplay(id: string): Promise<ReplayResponse | null> {
  const db = await open();
  try {
    const request = db.transaction(REPLAYS).objectStore(REPLAYS).get(id) as IDBRequest<ReplayResponse | undefined>;
    return (await result(request)) ?? null;
  } finally {
    db.close();
  }
}

export async function deleteReplay(id: string): Promise<void> {
  const db = await open();
  try {
    const transaction = db.transaction([REPLAYS, INDEX], "readwrite");
    const finished = done(transaction);
    transaction.objectStore(REPLAYS).delete(id);
    transaction.objectStore(INDEX).delete(id);
    await finished;
  } finally {
    db.close();
  }
}

/** Bietet ein Replay als Datei zum Speichern an. */
export function downloadReplay(replay: ReplayResponse): void {
  const blob = new Blob([JSON.stringify(replay)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `planetwars-${replay.match.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
