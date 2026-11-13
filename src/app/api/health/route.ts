import { connection } from "next/server";
import { getArena } from "@/lib/arena/arena";
import { handle, json } from "@/lib/http";

/** Lebenszeichen, Start-Kennung, eingebaute Bots, Standardwerte und Grenzen. */
export async function GET() {
  // Die Auskunft hängt vom laufenden Prozess ab und darf nicht beim Bauen eingefroren werden.
  await connection();
  return handle(() => json(getArena().health()));
}
