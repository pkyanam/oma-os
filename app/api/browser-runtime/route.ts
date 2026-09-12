import { randomBytes } from "node:crypto";
import {
  capabilities,
  closeSession,
  getSession,
  startSession,
  sessionInfo,
  perform,
  screenshot,
  RuntimeError,
} from "@/lib/remote-browser/service";
export const runtime = "nodejs";
export const maxDuration = 30;
const COOKIE = "oma-browser-owner";
const buckets = new Map<string, { count: number; until: number }>();
function effectiveURL(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) url.host = host;
  const protocol = request.headers.get("x-forwarded-proto");
  if (protocol === "http" || protocol === "https")
    url.protocol = protocol + ":";
  return url;
}
function guard(request: Request) {
  const url = effectiveURL(request),
    origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== url.origin)
  )
    throw new RuntimeError("Cross-origin browser control is not allowed.", 403);
  if (request.method === "POST" && origin !== url.origin)
    throw new RuntimeError("Same-origin browser control is required.", 403);
  if (
    process.env.NODE_ENV !== "production" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    process.env.OMA_BROWSER_ENABLED !== "1"
  )
    throw new RuntimeError(
      "Interactive browsing is available only on localhost unless explicitly enabled.",
      403,
    );
}
function owner(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(COOKIE + "="))
      ?.slice(COOKIE.length + 1) || ""
  );
}
function limit(key: string, max: number) {
  const now = Date.now(),
    previous = buckets.get(key),
    bucket =
      previous && previous.until > now
        ? previous
        : { count: 0, until: now + 60000 };
  if (++bucket.count > max)
    throw new RuntimeError("Browser input rate exceeded. Pause briefly.", 429);
  buckets.set(key, bucket);
  if (buckets.size > 2000)
    for (const [id, item] of buckets) if (item.until < now) buckets.delete(id);
}
function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof RuntimeError
          ? error.message
          : "The browser could not complete this action. Retry or reconnect.",
    },
    {
      status: error instanceof RuntimeError ? error.status : 502,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export async function GET(request: Request) {
  try {
    guard(request);
    const url = new URL(request.url);
    if (url.searchParams.has("capabilities"))
      return Response.json(capabilities(), {
        headers: { "Cache-Control": "no-store" },
      });
    const identity = owner(request);
    if (!/^[a-f0-9]{48}$/.test(identity))
      throw new RuntimeError(
        "Browser session expired. Reconnect to continue.",
        404,
      );
    limit(identity + ":frames", 500);
    const session = getSession(
      url.searchParams.get("sessionId") || "",
      identity,
    );
    const [image, info] = await Promise.all([
      screenshot(session),
      sessionInfo(session),
    ]);
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
        "X-Browser-URL": encodeURIComponent(info.url),
        "X-Browser-Title": encodeURIComponent(info.title),
        "X-Browser-Loading": String(info.loading),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
async function json(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new RuntimeError("JSON input required.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RuntimeError("JSON input required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 32768) {
      await reader.cancel();
      throw new RuntimeError("Browser input exceeds 32 KB.", 413);
    }
    chunks.push(value);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new RuntimeError("Invalid JSON input.");
  }
}
export async function POST(request: Request) {
  try {
    guard(request);
    const input = await json(request);
    let identity = owner(request);
    if (!/^[a-f0-9]{48}$/.test(identity))
      identity = randomBytes(24).toString("hex");
    limit(identity + ":actions", 1000);
    let result: unknown;
    if (input.action === "start") {
      limit(identity + ":starts", 8);
      const session = await startSession(identity, input);
      if (request.signal.aborted) {
        await closeSession(session);
        throw new RuntimeError("Browser start cancelled.", 499);
      }
      result = await sessionInfo(session);
    } else
      result = await perform(
        getSession(String(input.sessionId || ""), identity),
        input,
      );
    const secure =
      effectiveURL(request).protocol === "https:" ? "; Secure" : "";
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `${COOKIE}=${identity}; Path=/api/browser-runtime; HttpOnly; SameSite=Strict; Max-Age=86400${secure}`,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
