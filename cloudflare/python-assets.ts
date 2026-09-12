import { pythonAssetResponse as respond } from "../lib/runtime/python-assets";
export { PYODIDE_PREFIX } from "../lib/runtime/python-assets";
/** Call before the static asset fallback for /runtime/pyodide/* requests. */
export function pythonAssetResponse(
  request: Request,
  context: Pick<ExecutionContext, "waitUntil">,
) {
  return respond(request, {
    cache: (caches as CacheStorage & { default: Cache }).default,
    waitUntil: (work) => context.waitUntil(work),
  });
}
