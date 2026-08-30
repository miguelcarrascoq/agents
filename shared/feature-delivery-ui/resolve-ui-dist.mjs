/**
 * Resolve shared/feature-delivery-ui/dist from a lab's src/server.ts.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Call from lab `src/server.ts` via `import.meta.url`. */
export function resolveUiDist(fromImportMetaUrl) {
  const serverDir = path.dirname(fileURLToPath(fromImportMetaUrl));
  // lab/src → repo/shared/feature-delivery-ui/dist
  const dist = path.resolve(
    serverDir,
    "../../shared/feature-delivery-ui/dist",
  );
  if (existsSync(path.join(dist, "index.html"))) return dist;
  const env = process.env.FEATURE_DELIVERY_UI_DIST;
  if (env && existsSync(path.join(env, "index.html"))) return env;
  return null;
}
