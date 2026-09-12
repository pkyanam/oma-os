import { createHash } from "node:crypto";
import manifest from "./pyodide-assets.json";
export const PYODIDE_PREFIX = `/runtime/pyodide/v${manifest.version}/`;
export const PYODIDE_ASSET_LIMIT = 25 * 1024 * 1024;
type Asset = { sha256: string; bytes?: number };
const assets: Record<string, Asset> = manifest.assets;
type RuntimeCache = Pick<Cache, "match" | "put">;
type GatewayOptions = {
  fetcher?: typeof fetch;
  cache?: RuntimeCache;
  waitUntil?: (work: Promise<unknown>) => void;
};
function error(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
export function runtimeAsset(
  pathname: string,
): { name: string; asset: Asset } | null {
  if (!pathname.startsWith(PYODIDE_PREFIX)) return null;
  const name = pathname.slice(PYODIDE_PREFIX.length);
  if (!/^[A-Za-z0-9_.+-]+$/.test(name) || !Object.hasOwn(assets, name))
    return null;
  return { name, asset: assets[name] };
}
/** Hash while streaming: an oversized, truncated or modified body errors before completion/cache commit. */
export function verifiedRuntimeStream(
  body: ReadableStream<Uint8Array>,
  asset: Asset,
  limit = PYODIDE_ASSET_LIMIT,
) {
  const reader = body.getReader(),
    hash = createHash("sha256");
  let bytes = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          if (asset.bytes !== undefined && bytes !== asset.bytes)
            throw new Error("Python runtime asset size mismatch.");
          if (hash.digest("hex") !== asset.sha256)
            throw new Error("Python runtime asset integrity mismatch.");
          controller.close();
          return;
        }
        bytes += chunk.value.byteLength;
        if (bytes > limit)
          throw new Error("Python runtime asset exceeds 25 MiB.");
        hash.update(chunk.value);
        controller.enqueue(chunk.value);
      } catch (cause) {
        await reader.cancel(cause).catch(() => {});
        controller.error(cause);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
export async function pythonAssetResponse(
  request: Request,
  options: GatewayOptions = {},
): Promise<Response> {
  const url = new URL(request.url),
    entry = runtimeAsset(url.pathname);
  if (!entry || url.search)
    return error("Unknown pinned Python runtime asset.", 404);
  if (!["GET", "HEAD"].includes(request.method))
    return error("Runtime assets support GET and HEAD only.", 405);
  const etag = `"sha256-${entry.asset.sha256}"`;
  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Type": entry.name.endsWith(".mjs")
      ? "text/javascript; charset=utf-8"
      : entry.name.endsWith(".wasm")
        ? "application/wasm"
        : entry.name.endsWith(".json")
          ? "application/json; charset=utf-8"
          : "application/octet-stream",
  });
  if (request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  if (request.method === "HEAD") return new Response(null, { headers });
  const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });
  try {
    const cached = await options.cache?.match(cacheKey);
    if (cached) return cached;
  } catch {
    /* A cache outage must not prevent loading Python. */
  }
  let upstream: Response;
  try {
    upstream = await (options.fetcher ?? fetch)(manifest.source + entry.name, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "application/octet-stream",
        "Accept-Encoding": "identity",
      },
      signal: AbortSignal.timeout(45000),
    });
  } catch (cause) {
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      console.error(
        "Python runtime upstream fetch failed:",
        cause instanceof Error ? cause.message : String(cause),
      );
    return error(
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ? "Local Python upstream fetch failed: " +
            (cause instanceof Error ? cause.message : String(cause))
        : "Python runtime download failed. Try again shortly.",
      502,
    );
  }
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel();
    return error("Python runtime asset is unavailable upstream.", 502);
  }
  const advertised = Number(upstream.headers.get("content-length"));
  if (advertised > PYODIDE_ASSET_LIMIT) {
    await upstream.body.cancel();
    return error("This Python package exceeds the 25 MiB delivery limit.", 413);
  }
  const response = new Response(
    verifiedRuntimeStream(upstream.body, entry.asset),
    { headers },
  );
  if (options.cache) {
    const write = options.cache.put(cacheKey, response.clone()).catch(() => {});
    options.waitUntil?.(write);
  }
  return response;
}
