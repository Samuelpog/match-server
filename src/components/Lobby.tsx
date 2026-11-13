"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createMatch, fetchHealth, type Health } from "@/lib/client/api";
import { useRecentMatches } from "@/lib/client/recent";

export function Lobby() {
  const router = useRouter();
  const recent = useRecentMatches();
  const [health, setHealth] = useState<Health | null>(null);
  const [createKey, setCreateKey] = useState("");
  const [openId, setOpenId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(setHealth)
      .catch(() => {
        // Ohne Auskunft bleibt die Lobby benutzbar, nur ohne Hinweise.
      });
    return () => controller.abort();
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const match = await createMatch(createKey || undefined);
      router.push(`/m/${match.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das Match konnte nicht angelegt werden.");
      setCreating(false);
    }
  }

  function open(event: React.FormEvent) {
    event.preventDefault();
    const id = openId.trim().toLowerCase();
    if (id) router.push(`/m/${encodeURIComponent(id)}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex max-w-[640px] flex-col gap-2">
        <h1 className="text-xl font-semibold">Match-Server</h1>
        <p className="text-muted">
          Zwei Cloud-Umgebungen treten per REST gegeneinander an. Hier legst du ein Match an und schaust live zu.
        </p>
      </header>

      {health && !health.durable ? (
        <p role="status" className="max-w-[640px] border border-warn bg-surface p-2 text-sm text-warn">
          <strong>Kein dauerhafter Speicher angebunden.</strong> Matches liegen nur im Arbeitsspeicher und gehen auf
          Vercel zwischen zwei Aufrufen verloren. Zum Spielen muss Redis verbunden sein.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <form onSubmit={open} className="flex flex-col gap-1">
            <label htmlFor="open-id" className="font-semibold">
              Laufendes Match öffnen
            </label>
            <div className="flex flex-wrap gap-1">
              <input
                id="open-id"
                value={openId}
                onChange={(event) => setOpenId(event.target.value)}
                placeholder="Kennung, z. B. k7m2xq9rbt"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="min-h-6 min-w-0 flex-1 border border-line bg-surface px-2 font-mono"
              />
              <button type="submit" className="min-h-6 border border-ink px-3 font-semibold">
                Öffnen
              </button>
            </div>
          </form>

          <section aria-labelledby="zuletzt-titel" className="flex flex-col gap-1">
            <h2 id="zuletzt-titel" className="font-semibold">
              Zuletzt geöffnet
            </h2>
            {recent.length === 0 ? (
              <p className="text-sm text-muted">
                Noch nichts. Matches, die du in diesem Browser öffnest, stehen danach hier.
              </p>
            ) : (
              <ul className="flex flex-col">
                {recent.map((id) => (
                  <li key={id} className="border-t border-line">
                    <Link href={`/m/${id}`} className="flex min-h-6 items-center font-mono hover:underline">
                      {id}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Auf dem Handy klebt die Hauptaktion unten, in Reichweite des Daumens. */}
        <form
          onSubmit={create}
          className="sticky bottom-0 -mx-2 flex flex-col gap-1 border-t border-line bg-ground p-2 pb-[max(16px,env(safe-area-inset-bottom))] lg:static lg:mx-0 lg:border lg:bg-surface lg:p-3"
        >
          {health?.createKeyRequired ? (
            <>
              <label htmlFor="create-key" className="text-sm font-semibold">
                Schlüssel zum Anlegen
              </label>
              <input
                id="create-key"
                type="password"
                value={createKey}
                onChange={(event) => setCreateKey(event.target.value)}
                autoComplete="off"
                required
                className="min-h-6 border border-line bg-surface px-2 font-mono"
              />
            </>
          ) : null}
          <button
            type="submit"
            disabled={creating}
            className="min-h-6 bg-accent px-3 font-semibold text-on-accent disabled:opacity-60"
          >
            {creating ? "Match wird angelegt …" : "Neues Match anlegen"}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
