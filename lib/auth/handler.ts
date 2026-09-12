import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  createChatGPTHandler,
  type ChatGPTHandler,
  type StoredSession,
  type RateLimitBucket,
} from "@opencoredev/loginwithchatgpt-server";
import { FileStore, RedisStore, redisCommand } from "./store";
import {
  memorySessionLock,
  redisSessionLock,
  serializeSessionRequests,
} from "./session-lock";
import { authLockContext } from "./lock-context";
const dataDir = process.env.OMA_AUTH_DIR ?? join(process.cwd(), ".oma-auth");
export function authAvailability() {
  const shared = !!(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
  return {
    enabled: !process.env.VERCEL || !!(shared && process.env.LWC_SECRET),
    storage: shared ? "redis" : "local",
    reason:
      process.env.VERCEL && !shared
        ? "ChatGPT login on this deployment needs a shared session store. Use a provider key, or self-host for bundled login."
        : process.env.VERCEL && !process.env.LWC_SECRET
          ? "Set LWC_SECRET to enable ChatGPT login."
          : undefined,
  };
}
async function stableSecret() {
  if (process.env.LWC_SECRET) return process.env.LWC_SECRET;
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, "secret");
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const secret = randomBytes(32).toString("hex");
    try {
      await writeFile(path, secret, { flag: "wx", mode: 0o600 });
      return secret;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        return readFile(path, "utf8");
      throw error;
    }
  }
}
let instance: Promise<Pick<ChatGPTHandler, "handler" | "fetch">> | undefined;
export function authHandler() {
  if (!authAvailability().enabled)
    throw new Error("ChatGPT auth is not configured on this deployment");
  if (!instance)
    instance = (async () => {
      const url =
          process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
        token =
          process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
      const namespace = process.env.OMA_AUTH_NAMESPACE || "oma-os:";
      const secret = await stableSecret(),
        redis = url && token ? redisCommand(url, token) : undefined;
      const sdk = createChatGPTHandler({
        secret,
        fetch: async (input, init) => {
          const timeout = new AbortController();
          const timer = setTimeout(
            () => timeout.abort(new Error("Authentication upstream timed out")),
            20000,
          );
          timer.unref?.();
          const lock = authLockContext.getStore();
          const signal = AbortSignal.any([
            timeout.signal,
            ...(init?.signal ? [init.signal] : []),
            ...(lock ? [lock.signal] : []),
          ]);
          try {
            const response = await fetch(input, { ...init, signal });
            // JSON auth/model bodies remain bounded, not merely their headers.
            // An authenticated SSE answer may continue beyond startup timeout.
            if (
              response.headers
                .get("content-type")
                ?.includes("text/event-stream")
            )
              clearTimeout(timer);
            return response;
          } catch (error) {
            clearTimeout(timer);
            throw error;
          }
        },
        sessionStore: redis
          ? new RedisStore<StoredSession>(
              url!,
              token!,
              namespace + "session:",
              redis,
            )
          : new FileStore<StoredSession>(join(dataDir, "sessions")),
        sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
        responsesProxy: {
          maxRequestBytes: 512 * 1024,
          rateLimit: {
            limit: 20,
            windowMs: 60000,
            store: redis
              ? new RedisStore<RateLimitBucket>(
                  url!,
                  token!,
                  namespace + "rate:",
                  redis,
                )
              : new FileStore<RateLimitBucket>(join(dataDir, "rates")),
          },
        },
      });
      const handler = serializeSessionRequests(
        sdk.handler,
        secret,
        redis ? redisSessionLock(redis, { namespace }) : memorySessionLock(),
      );
      return { handler, fetch: handler };
    })().catch((error) => {
      instance = undefined;
      throw error;
    });
  return instance;
}
