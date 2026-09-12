import { randomUUID, createHash } from "node:crypto";
import { readCookie, unsign } from "@opencoredev/loginwithchatgpt-server";
import { authLockContext } from "./lock-context";
import type { RedisCommand } from "./store";
export type SessionLock = {
  run: <T>(sessionId: string, action: () => Promise<T>) => Promise<T>;
};
// One Node process in local-file mode. Multi-instance deployments must use Redis.
export function memorySessionLock(): SessionLock {
  const tails = new Map<string, Promise<void>>();
  return {
    async run<T>(key: string, action: () => Promise<T>) {
      const previous = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      tails.set(key, current);
      await previous;
      try {
        return await action();
      } finally {
        release();
        if (tails.get(key) === current) tails.delete(key);
      }
    },
  };
}
export function redisSessionLock(
  command: RedisCommand,
  options: {
    leaseMs?: number;
    waitMs?: number;
    pollMs?: number;
    namespace?: string;
  } = {},
): SessionLock {
  const leaseMs = options.leaseMs ?? 30000,
    waitMs = options.waitMs ?? 15000,
    pollMs = options.pollMs ?? 80;
  return {
    async run<T>(sessionId: string, action: () => Promise<T>) {
      const key =
          (options.namespace ?? "oma-os:") +
          "lock:" +
          createHash("sha256").update(sessionId).digest("hex"),
        owner = randomUUID(),
        deadline = Date.now() + waitMs;
      while (
        (await command(["SET", key, owner, "NX", "PX", leaseMs])) !== "OK"
      ) {
        if (Date.now() >= deadline)
          throw new Error("Session is busy; retry shortly");
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
      const abort = new AbortController();
      let renewing: Promise<void> | undefined;
      const timer = setInterval(
        () => {
          if (renewing) return;
          renewing = (async () => {
            try {
              const result = await command([
                "EVAL",
                "if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end; return redis.call('PEXPIRE',KEYS[1],ARGV[2])",
                1,
                key,
                owner,
                leaseMs,
              ]);
              if (result !== 1) abort.abort(new Error("Session lease expired"));
            } catch {
              abort.abort(new Error("Session lease renewal failed"));
            } finally {
              renewing = undefined;
            }
          })();
        },
        Math.max(10, Math.floor(leaseMs / 3)),
      );
      timer.unref?.();
      try {
        return await authLockContext.run(
          { key, owner, sessionId, signal: abort.signal },
          async () => {
            const result = await action();
            abort.signal.throwIfAborted();
            return result;
          },
        );
      } finally {
        clearInterval(timer);
        await renewing;
        await command([
          "EVAL",
          "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0",
          1,
          key,
          owner,
        ]).catch(() => {});
      }
    },
  };
}
export function serializeSessionRequests(
  handler: (request: Request) => Promise<Response>,
  secret: string,
  lock: SessionLock,
) {
  return async (request: Request) => {
    const cookie = readCookie(request, "lwc_session");
    const sessionId =
      cookie && cookie.length < 1024 ? await unsign(cookie, secret) : undefined;
    return sessionId
      ? lock.run(sessionId, () => handler(request))
      : handler(request);
  };
}
