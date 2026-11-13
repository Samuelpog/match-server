/**
 * Lässt Node die TypeScript-Dateien des Projekts direkt laden: ergänzt bei
 * Importen ohne Endung ".ts" und löst den Alias "@/" auf "src/" auf. Die
 * Typen entfernt Node selbst (ab Version 22.18).
 */
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../src/", import.meta.url);

function withExtension(url) {
  const path = fileURLToPath(url);
  if (existsSync(path) && statSync(path).isFile()) return url;
  if (existsSync(path + ".ts")) return url + ".ts";
  if (existsSync(path + "/index.ts")) return url + "/index.ts";
  return url;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(withExtension(new URL(specifier.slice(2), SRC).href), context);
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      const resolved = new URL(specifier, context.parentURL).href;
      if (resolved.startsWith(pathToFileURL(process.cwd()).href) || resolved.startsWith(SRC.href)) {
        return nextResolve(withExtension(resolved), context);
      }
    }
    return nextResolve(specifier, context);
  },
});
