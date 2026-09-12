import test from "node:test";
import assert from "node:assert/strict";
import {
  createChatGPTHandler,
  SessionManager,
  MemoryStore,
  sign,
  unsign,
  readCookie,
  type StoredSession,
  type RateLimitBucket,
} from "@opencoredev/loginwithchatgpt-server";
import { resolveConfig } from "@opencoredev/loginwithchatgpt-core";
import { memorySessionLock, serializeSessionRequests } from "./session-lock";
const secret = "test-only-multiuser-secret-32-characters";
const request = (
  path: string,
  cookie?: string,
  method = "GET",
  origin = "https://oma.test",
) =>
  new Request("https://oma.test/api/chatgpt/" + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      origin,
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
const cookieFor = async (id: string) =>
  "lwc_session=" + encodeURIComponent(await sign(id, secret));
function jwt(account: string) {
  return (
    "eyJhbGciOiJub25lIn0." +
    Buffer.from(
      JSON.stringify({
        email: account + "@example.test",
        "https://api.openai.com/auth": { chatgpt_account_id: account },
      }),
    ).toString("base64url") +
    ".fixture"
  );
}

test("independent device logins retain encrypted account tokens and logout only its own cookie session", async () => {
  const store = new MemoryStore<StoredSession>();
  let next = 0;
  const seen: Array<{ authorization: string | null; account: string | null }> =
    [];
  const transport: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/deviceauth/usercode")) {
      const id = String(++next);
      return Response.json({
        device_auth_id: id,
        user_code: "USER-" + id,
        interval: 1,
      });
    }
    if (url.endsWith("/deviceauth/token")) {
      const id = JSON.parse(String(init?.body)).device_auth_id;
      return Response.json({
        authorization_code: id,
        code_verifier: "verifier",
        code_challenge: "challenge",
      });
    }
    if (url.endsWith("/oauth/token")) {
      const id = new URLSearchParams(String(init?.body)).get("code")!;
      return Response.json({
        access_token: "access-" + id,
        refresh_token: "refresh-" + id,
        id_token: jwt(id),
        expires_in: 3600,
      });
    }
    seen.push({
      authorization: new Headers(init?.headers).get("authorization"),
      account: new Headers(init?.headers).get("chatgpt-account-id"),
    });
    return Response.json({ models: [] });
  };
  const sdk = createChatGPTHandler({
    secret,
    sessionStore: store,
    fetch: transport,
  });
  const run = serializeSessionRequests(
    sdk.handler,
    secret,
    memorySessionLock(),
  );
  const logins = await Promise.all([
    run(request("login", undefined, "POST")),
    run(request("login", undefined, "POST")),
  ]);
  const cookies = logins.map(
    (response) => response.headers.get("set-cookie")!.split(";")[0],
  );
  assert.notEqual(cookies[0], cookies[1]);
  for (const response of logins) {
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
    assert.match(response.headers.get("set-cookie")!, /Secure/i);
    assert.match(response.headers.get("set-cookie")!, /SameSite=Lax/i);
  }
  const statuses = await Promise.all(
    cookies.map((cookie) =>
      run(request("status", cookie)).then((r) => r.json()),
    ),
  );
  assert.deepEqual(statuses.map((status) => status.user.accountId).sort(), [
    "1",
    "2",
  ]);
  for (const cookie of cookies) {
    const sid = await unsign(
      readCookie(request("session", cookie), "lwc_session")!,
      secret,
    );
    const stored = await store.get(sid!);
    assert.ok(stored?.tokensCipher);
    assert.equal(stored?.tokensPlain, undefined);
    assert.ok(!JSON.stringify(stored).includes("access-"));
    assert.ok(!JSON.stringify(stored).includes("refresh-"));
  }
  await Promise.all(cookies.map((cookie) => run(request("models", cookie))));
  assert.deepEqual(
    seen.sort((a, b) => a.account!.localeCompare(b.account!)),
    [
      { authorization: "Bearer access-1", account: "1" },
      { authorization: "Bearer access-2", account: "2" },
    ],
  );
  await run(request("logout", cookies[0], "POST"));
  assert.equal(
    (await (await run(request("session", cookies[0]))).json()).status,
    "unauthenticated",
  );
  assert.equal(
    (await (await run(request("session", cookies[1]))).json()).user.accountId,
    statuses[1].user.accountId,
  );
  assert.equal(
    (await run(request("logout", cookies[1], "POST", "https://evil.test")))
      .status,
    403,
  );
  assert.equal(
    (await (await run(request("session", cookies[1]))).json()).status,
    "authenticated",
  );
  assert.equal(
    (await (await run(request("session", cookies[1] + "tampered"))).json())
      .status,
    "unauthenticated",
  );
});

test("serialized handlers across instances refresh once and cannot resurrect a session after logout", async () => {
  const store = new MemoryStore<StoredSession>();
  let refreshes = 0;
  let entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  let finish!: () => void;
  const release = new Promise<void>((r) => {
    finish = r;
  });
  const transport: typeof fetch = async () => {
    refreshes++;
    entered();
    await release;
    return Response.json({
      access_token: "fresh",
      refresh_token: "rotated",
      id_token: jwt("account"),
      expires_in: 3600,
    });
  };
  const manager = new SessionManager({
    config: resolveConfig({ fetch: transport }),
    store,
    secret,
    sessionTtlMs: 3600000,
  });
  await manager.save("a", {
    status: "authenticated",
    createdAt: 0,
    updatedAt: 0,
    tokens: {
      accessToken: "expired",
      refreshToken: "old",
      accountId: "account",
      expiresAt: 1,
    },
  });
  const lock = memorySessionLock();
  const handlers = [1, 2].map(() =>
    serializeSessionRequests(
      createChatGPTHandler({ secret, sessionStore: store, fetch: transport })
        .handler,
      secret,
      lock,
    ),
  );
  const cookie = await cookieFor("a");
  const first = handlers[0](request("status", cookie));
  await started;
  const second = handlers[1](request("status", cookie));
  const logout = handlers[1](request("logout", cookie, "POST"));
  finish();
  const responses = await Promise.all([first, second, logout]);
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(refreshes, 1);
  assert.equal(await store.get("a"), undefined);
});

test("session rate counters are isolated and concurrent requests consume individual slots", async () => {
  const sessions = new MemoryStore<StoredSession>(),
    rates = new MemoryStore<RateLimitBucket>();
  const manager = new SessionManager({
    config: resolveConfig(),
    store: sessions,
    secret,
    sessionTtlMs: 3600000,
  });
  for (const id of ["a", "b"])
    await manager.save(id, {
      status: "authenticated",
      createdAt: 0,
      updatedAt: 0,
      tokens: {
        accessToken: "fixture",
        accountId: id,
        expiresAt: Date.now() + 3600000,
      },
    });
  const lock = memorySessionLock();
  const handlers = [1, 2].map(() =>
    serializeSessionRequests(
      createChatGPTHandler({
        secret,
        sessionStore: sessions,
        responsesProxy: {
          rateLimit: { limit: 1, windowMs: 60000, store: rates },
        },
        fetch: async () => new Response("fixture"),
      }).handler,
      secret,
      lock,
    ),
  );
  const a = await cookieFor("a"),
    b = await cookieFor("b");
  const result = await Promise.all(
    handlers.map((handler) => handler(request("responses", a, "POST"))),
  );
  assert.equal(result.filter((r) => r.status === 429).length, 1);
  assert.notEqual(
    (await handlers[0](request("responses", b, "POST"))).status,
    429,
  );
  assert.equal((await rates.get("a"))?.count, 1);
  assert.equal((await rates.get("b"))?.count, 1);
});

test("only a verified cookie selects a session lock", async () => {
  const keys: string[] = [];
  const run = serializeSessionRequests(
    async () => Response.json({ ok: true }),
    secret,
    {
      run: async (key, action) => {
        keys.push(key);
        return action();
      },
    },
  );
  await run(request("session", "lwc_session=attacker.signature"));
  await run(request("session"));
  await run(request("session", await cookieFor("verified-session")));
  assert.deepEqual(keys, ["verified-session"]);
});
