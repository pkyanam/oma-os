import {
  createChatGPTHandler,
  readCookie,
  serializeCookie,
  sign,
  unsign,
  type StoredSession,
  type RateLimitBucket,
  type KeyValueStore,
} from "@opencoredev/loginwithchatgpt-server";
export const AUTH_COOKIE = "lwc_session";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
export type AuthObjectId = { toString(): string };
export type AuthEnv = {
  LWC_SECRET: string;
  AUTH_SESSIONS: {
    idFromName(name: string): AuthObjectId;
    get(id: AuthObjectId): { fetch(request: Request): Promise<Response> };
  };
};
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
function cookieOptions(request: Request) {
  const url = new URL(request.url);
  const local =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return {
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: !local,
    maxAge: TTL_MS / 1000,
  };
}
export async function verifiedSession(request: Request, secret: string) {
  const cookie = readCookie(request, AUTH_COOKIE);
  if (!cookie || cookie.length > 1024) return undefined;
  const id = await unsign(cookie, secret);
  return id && /^[a-zA-Z0-9_-]{20,128}$/.test(id) ? id : undefined;
}
function clearCookie(request: Request) {
  return serializeCookie(AUTH_COOKIE, "", {
    ...cookieOptions(request),
    maxAge: 0,
  });
}
export async function routeAuth(
  request: Request,
  env: AuthEnv,
): Promise<Response> {
  if (!env.LWC_SECRET || env.LWC_SECRET.length < 32)
    return json({ error: "auth_not_configured" }, 503);
  const path = new URL(request.url).pathname.slice("/api/chatgpt".length);
  const methods: Record<string, string> = {
    "/login": "POST",
    "/status": "GET",
    "/session": "GET",
    "/logout": "POST",
    "/models": "GET",
    "/responses": "POST",
  };
  if (!methods[path]) return json({ error: "not_found" }, 404);
  if (request.method !== methods[path])
    return json({ error: "method_not_allowed" }, 405, { allow: methods[path] });
  const origin = request.headers.get("origin");
  if (
    request.method !== "GET" &&
    origin &&
    origin !== new URL(request.url).origin
  )
    return json({ error: "origin_not_allowed" }, 403);
  let id = await verifiedSession(request, env.LWC_SECRET);
  const hadCookie = !!readCookie(request, AUTH_COOKIE);
  if (!id && hadCookie)
    return json(
      path === "/session" || path === "/status"
        ? { status: "unauthenticated" }
        : { error: "not_authenticated" },
      path === "/session" || path === "/status" ? 200 : 401,
      { "set-cookie": clearCookie(request) },
    );
  let issued: string | undefined;
  if (!id && path === "/login") {
    id = crypto.randomUUID().replaceAll("-", "");
    issued = await sign(id, env.LWC_SECRET);
    const headers = new Headers(request.headers);
    headers.set("cookie", `${AUTH_COOKIE}=${encodeURIComponent(issued)}`);
    request = new Request(request, { headers });
  }
  if (!id) {
    if (path === "/session" || path === "/status")
      return json({ status: "unauthenticated" });
    if (path === "/logout")
      return json({ status: "unauthenticated" }, 200, {
        "set-cookie": clearCookie(request),
      });
    return json({ error: "not_authenticated" }, 401);
  }
  const response = await env.AUTH_SESSIONS.get(
    env.AUTH_SESSIONS.idFromName(id),
  ).fetch(request);
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  if (issued && response.ok)
    headers.set(
      "set-cookie",
      serializeCookie(AUTH_COOKIE, issued, cookieOptions(request)),
    );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
export type SqlPort = {
  exec(
    query: string,
    ...bindings: (string | number | null)[]
  ): Iterable<Record<string, unknown>>;
};
export type AuthStorage = {
  sql: SqlPort;
  setAlarm(time: number): Promise<unknown>;
  deleteAlarm(): Promise<unknown>;
  deleteAll(): Promise<unknown>;
};
export function serialQueue() {
  let tail = Promise.resolve();
  return async <T>(action: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  };
}
export function createAuthController(
  storage: AuthStorage,
  secret: string,
  transport: typeof fetch = fetch,
) {
  const queue = serialQueue();
  let initialized = false;
  function initialize() {
    if (!initialized) {
      storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS auth_records (scope TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, expires_at REAL NOT NULL, PRIMARY KEY(scope,id))",
      );
      initialized = true;
    }
  }
  async function schedule() {
    const row = [
      ...storage.sql.exec("SELECT MIN(expires_at) AS next FROM auth_records"),
    ][0];
    if (typeof row?.next === "number")
      await storage.setAlarm(Math.max(Date.now() + 1000, row.next));
    else await storage.deleteAlarm();
  }
  function store<T>(scope: string): KeyValueStore<T> {
    return {
      async get(id) {
        initialize();
        const row = [
          ...storage.sql.exec(
            "SELECT value, expires_at FROM auth_records WHERE scope = ? AND id = ?",
            scope,
            id,
          ),
        ][0];
        if (!row || Number(row.expires_at) <= Date.now()) return undefined;
        return JSON.parse(String(row.value)) as T;
      },
      async set(id, value, options) {
        initialize();
        storage.sql.exec(
          "INSERT INTO auth_records(scope,id,value,expires_at) VALUES(?,?,?,?) ON CONFLICT(scope,id) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
          scope,
          id,
          JSON.stringify(value),
          Date.now() + (options?.ttlMs ?? TTL_MS),
        );
        await schedule();
      },
      async delete(id) {
        initialize();
        storage.sql.exec(
          "DELETE FROM auth_records WHERE scope = ? AND id = ?",
          scope,
          id,
        );
        await schedule();
      },
    };
  }
  const sdk = createChatGPTHandler({
    secret,
    sessionStore: store<StoredSession>("session"),
    sessionTtlMs: TTL_MS,
    responsesProxy: {
      maxRequestBytes: 512 * 1024,
      rateLimit: {
        limit: 20,
        windowMs: 60000,
        store: store<RateLimitBucket>("rate"),
      },
    },
    fetch: async (input, init) => {
      const abort = new AbortController();
      const timer = setTimeout(
        () => abort.abort(new Error("Authentication upstream timed out")),
        20000,
      );
      (timer as unknown as { unref?: () => void }).unref?.();
      try {
        const response = await transport(input, {
          ...init,
          signal: AbortSignal.any([
            abort.signal,
            ...(init?.signal ? [init.signal] : []),
          ]),
        });
        if (
          !response.body ||
          response.headers.get("content-type")?.includes("text/event-stream")
        ) {
          clearTimeout(timer);
          return response;
        }
        const reader = response.body.getReader();
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const chunk = await reader.read();
              if (chunk.done) {
                clearTimeout(timer);
                controller.close();
              } else controller.enqueue(chunk.value);
            } catch (error) {
              clearTimeout(timer);
              controller.error(error);
            }
          },
          cancel(reason) {
            clearTimeout(timer);
            return reader.cancel(reason);
          },
        });
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        clearTimeout(timer);
        throw error;
      }
    },
  });
  return {
    fetch: (request: Request) =>
      queue(async () => {
        initialize();
        return sdk.handler(request);
      }),
    alarm: () =>
      queue(async () => {
        initialize();
        storage.sql.exec(
          "DELETE FROM auth_records WHERE expires_at <= ?",
          Date.now(),
        );
        const count = Number(
          [...storage.sql.exec("SELECT COUNT(*) AS count FROM auth_records")][0]
            ?.count ?? 0,
        );
        if (!count) {
          await storage.deleteAll();
          initialized = false;
        } else await schedule();
      }),
  };
}

/** Verified routing cookies include pending logins; browser ownership requires
 * a persisted authenticated session, without advancing/refreshing its tokens. */
export async function authenticatedIdentity(
  request: Request,
  env: AuthEnv,
): Promise<string | undefined> {
  if (!env.LWC_SECRET || env.LWC_SECRET.length < 32) return undefined;
  const id = await verifiedSession(request, env.LWC_SECRET);
  if (!id) return undefined;
  const url = new URL(request.url);
  url.pathname = "/api/chatgpt/session";
  url.search = "";
  const response = await env.AUTH_SESSIONS.get(
    env.AUTH_SESSIONS.idFromName(id),
  ).fetch(
    new Request(url, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    }),
  );
  if (!response.ok) return undefined;
  const result = (await response.json()) as { status?: string };
  return result.status === "authenticated" ? id : undefined;
}

/** Stable authenticated account identity for server-side quotas. Never accept a
 * client account ID or use the per-login routing cookie as an account identity. */
export async function authenticatedAccountIdentity(
  request: Request,
  env: AuthEnv,
): Promise<string | undefined> {
  if (!env.LWC_SECRET || env.LWC_SECRET.length < 32) return undefined;
  const id = await verifiedSession(request, env.LWC_SECRET);
  if (!id) return undefined;
  const url = new URL(request.url);
  url.pathname = "/api/chatgpt/session";
  url.search = "";
  const response = await env.AUTH_SESSIONS.get(
    env.AUTH_SESSIONS.idFromName(id),
  ).fetch(
    new Request(url, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    }),
  );
  if (!response.ok) return undefined;
  const result = (await response.json()) as {
    status?: string;
    user?: { accountId?: unknown };
  };
  if (
    result.status !== "authenticated" ||
    typeof result.user?.accountId !== "string" ||
    !result.user.accountId ||
    result.user.accountId.length > 256
  )
    return undefined;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`oma-workers-ai:${result.user.accountId}`),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
