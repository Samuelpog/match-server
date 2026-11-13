"use client";

import { useSyncExternalStore } from "react";

const KEY = "match-server:zuletzt";
const LIMIT = 5;
const EMPTY = "[]";

// Der Speicher des Browsers kann fehlen oder gesperrt sein (privates Fenster).
// Die Seite muss dann ohne die Liste auskommen, statt abzustürzen.
function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("match-server:recent", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("match-server:recent", onChange);
  };
}

function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function rememberMatch(id: string) {
  try {
    const next = [id, ...parse(read()).filter((entry) => entry !== id)].slice(0, LIMIT);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("match-server:recent"));
  } catch {
    // Ohne Speicher gibt es keine Liste, mehr nicht.
  }
}

export function useRecentMatches(): string[] {
  const raw = useSyncExternalStore(subscribe, read, () => EMPTY);
  return parse(raw);
}
