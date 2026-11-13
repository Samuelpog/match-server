import { connection } from "next/server";
import { listGames } from "@/lib/games";
import { handle, json } from "@/lib/http";
import { getStore } from "@/lib/match/store";

export async function GET() {
  // Die Auskunft hängt von der laufenden Umgebung ab und darf nicht beim Bauen eingefroren werden.
  await connection();
  return handle(async () => {
    const store = getStore();
    return json({
      ok: true,
      store: store.kind,
      durable: store.kind === "redis",
      createKeyRequired: Boolean(process.env.CREATE_KEY),
      games: listGames(),
    });
  });
}
