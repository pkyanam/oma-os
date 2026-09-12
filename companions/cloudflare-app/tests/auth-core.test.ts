import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readCookie, unsign } from "@opencoredev/loginwithchatgpt-server";
import { createChatGPTProxyProvider } from "@opencoredev/loginwithchatgpt-ai";
import { generateText } from "ai";
import {
  routeAuth,
  createAuthController,
  authenticatedIdentity,
  type AuthEnv,
  type AuthStorage,
} from "../src/auth-core";
const secret = "cloudflare-test-only-secret-32-characters";
function storage() {
  const db = new DatabaseSync(":memory:");
  let alarm: number | undefined;
  const port: AuthStorage = {
    sql: {
      exec(query, ...bindings) {
        const statement = db.prepare(query);
        if (statement.columns().length) return statement.all(...bindings);
        statement.run(...bindings);
        return [];
      },
    },
    setAlarm: async (time) => {
      alarm = time;
    },
    deleteAlarm: async () => {
      alarm = undefined;
    },
    deleteAll: async () => {
      db.exec("DROP TABLE IF EXISTS auth_records");
      alarm = undefined;
    },
  };
  return {
    db,
    port,
    get alarm() {
      return alarm;
    },
  };
}
const request = (
  path: string,
  cookie?: string,
  method = "GET",
  origin = "https://oma.test",
) =>
  new Request("https://oma.test/api/chatgpt/" + path, {
    method,
    headers: {
      origin,
      ...(cookie ? { cookie } : {}),
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
function fixture(
  responses?: typeof fetch,
  options: { initialExpiresIn?: number; refreshFailure?: boolean } = {},
) {
  const objects = new Map<
    string,
    {
      storage: ReturnType<typeof storage>;
      controller: ReturnType<typeof createAuthController>;
    }
  >();
  let next = 0,
    refreshes = 0;
  const provider: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/responses") && responses) return responses(input, init);
    if (url.endsWith("/deviceauth/usercode"))
      return Response.json({
        device_auth_id: String(++next),
        user_code: "CODE-" + next,
        interval: 1,
      });
    if (url.endsWith("/deviceauth/token"))
      return Response.json({
        authorization_code: JSON.parse(String(init?.body)).device_auth_id,
        code_verifier: "fixture",
        code_challenge: "fixture",
      });
    if (url.endsWith("/oauth/token")) {
      const raw = String(init?.body);
      const refreshing = new Headers(init?.headers)
        .get("content-type")
        ?.includes("application/json");
      if (refreshing) {
        refreshes++;
        const payload = JSON.parse(raw);
        assert.equal(payload.grant_type, "refresh_token");
        assert.match(payload.refresh_token, /^refresh-/);
        if (options.refreshFailure)
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        if (options.refreshTemporary)
          return Response.json(
            { error: "temporarily_unavailable" },
            { status: 503 },
          );
      }
      const code = refreshing
        ? JSON.parse(raw).refresh_token.replace("refresh-", "")
        : new URLSearchParams(raw).get("code");
      return Response.json({
        access_token: (refreshing ? "renewed-" : "access-") + code,
        refresh_token: "refresh-" + code,
        id_token:
          "e30." +
          Buffer.from(
            JSON.stringify({
              "https://api.openai.com/auth": {
                chatgpt_account_id: "fixture-account",
              },
            }),
          ).toString("base64url") +
          ".fixture",
        expires_in: refreshing ? 3600 : (options.initialExpiresIn ?? 3600),
      });
    }
    throw new Error("Unexpected provider request");
  };
  const env: AuthEnv = {
    LWC_SECRET: secret,
    AUTH_SESSIONS: {
      idFromName: (name) => ({ toString: () => name }),
      get: (id) => ({
        fetch: async (req) => {
          const name = id.toString();
          if (!objects.has(name)) {
            const store = storage();
            objects.set(name, {
              storage: store,
              controller: createAuthController(store.port, secret, provider),
            });
          }
          return objects.get(name)!.controller.fetch(req);
        },
      }),
    },
  };
  return {
    env,
    objects,
    get refreshes() {
      return refreshes;
    },
    close: () => {
      for (const object of objects.values()) object.storage.db.close();
    },
  };
}

test("anonymous status and tampered cookies never allocate an auth object", async () => {
  const f = fixture();
  try {
    assert.equal(
      (await (await routeAuth(request("session"), f.env)).json()).status,
      "unauthenticated",
    );
    assert.equal(
      (
        await routeAuth(
          request("login", "lwc_session=forged.signature", "POST"),
          f.env,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await routeAuth(
          request("login", undefined, "POST", "https://evil.test"),
          f.env,
        )
      ).status,
      403,
    );
    assert.equal(f.objects.size, 0);
  } finally {
    f.close();
  }
});

test("first login preserves injected SDK SID, routes both accounts independently and encrypts SQLite tokens", async () => {
  const f = fixture();
  try {
    const responses = await Promise.all([
      routeAuth(request("login", undefined, "POST"), f.env),
      routeAuth(request("login", undefined, "POST"), f.env),
    ]);
    const cookies = responses.map(
      (response) => response.headers.get("set-cookie")!.split(";")[0],
    );
    assert.notEqual(cookies[0], cookies[1]);
    assert.equal(f.objects.size, 2);
    for (const response of responses)
      assert.match(
        response.headers.get("set-cookie")!,
        /HttpOnly; Secure; SameSite=Lax/,
      );
    for (const cookie of cookies) {
      const req = request("status", cookie);
      const id = await unsign(readCookie(req, "lwc_session")!, secret);
      assert.ok(
        id && f.objects.has(id),
        "returned SDK cookie must route to original DO",
      );
      const row = f.objects
        .get(id!)!
        .storage.db.prepare("SELECT id FROM auth_records WHERE scope='session'")
        .get();
      assert.equal(row?.id, id);
      assert.equal(await authenticatedIdentity(req, f.env), undefined);
      assert.equal(
        (await (await routeAuth(req, f.env)).json()).status,
        "authenticated",
      );
      assert.equal(await authenticatedIdentity(req, f.env), id);
      const stored = f.objects
        .get(id!)!
        .storage.db.prepare(
          "SELECT value FROM auth_records WHERE scope='session'",
        )
        .get()!;
      assert.ok(String(stored.value).includes("tokensCipher"));
      assert.ok(!String(stored.value).includes("access-"));
      assert.ok(f.objects.get(id!)!.storage.alarm);
    }
    await routeAuth(request("logout", cookies[0], "POST"), f.env);
    assert.equal(
      await authenticatedIdentity(request("session", cookies[0]), f.env),
      undefined,
    );
    assert.ok(
      await authenticatedIdentity(request("session", cookies[1]), f.env),
    );
  } finally {
    f.close();
  }
});

test("expired SQLite records are cleaned by alarms and the next request can reinitialize storage", async () => {
  const f = fixture();
  try {
    const response = await routeAuth(
      request("login", undefined, "POST"),
      f.env,
    );
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const object = [...f.objects.values()][0];
    object.storage.db.exec("UPDATE auth_records SET expires_at=1");
    await object.controller.alarm();
    assert.equal(
      object.storage.db
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE name='auth_records'",
        )
        .get()?.count,
      0,
    );
    assert.equal(
      (await (await routeAuth(request("session", cookie), f.env)).json())
        .status,
      "unauthenticated",
    );
  } finally {
    f.close();
  }
});

test("real Responses provider receives an informative sanitized HTTP 403 through Cloudflare auth proxy", async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return new Response(
      "<!doctype html><html><title>Access denied</title><body>Request blocked by upstream</body></html>",
      { status: 403, headers: { "content-type": "text/html" } },
    );
  });
  try {
    const login = await routeAuth(request("login", undefined, "POST"), f.env);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await routeAuth(request("status", cookie), f.env);
    const model = createChatGPTProxyProvider({
      fetch: async (input, init) => {
        const req = new Request(
          new URL(String(input), "https://oma.test"),
          init,
        );
        req.headers.set("cookie", cookie);
        req.headers.set("origin", "https://oma.test");
        return routeAuth(req, f.env);
      },
    })("gpt-5.6-luna");
    await assert.rejects(
      generateText({ model, prompt: "Fixture", maxRetries: 0 }),
      (error: unknown) => {
        const failure = error as Error & {
          responseBody?: string;
          statusCode?: number;
        };
        assert.equal(failure.statusCode, 403);
        assert.doesNotMatch(
          failure.responseBody ?? "",
          /<html|<!doctype|Request blocked by upstream/,
        );
        assert.match(failure.message, /OpenAI rejected this server/);
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    f.close();
  }
});

test("agent streams through the full authenticated proxy with the expected request contract", async () => {
  const { runAgent } = await import("../../../lib/agent/harness");
  let calls = 0;
  const f = fixture(async (input, init) => {
    calls++;
    assert.equal(
      new URL(String(input)).pathname,
      "/backend-api/codex/responses",
    );
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer access-1");
    assert.equal(headers.get("chatgpt-account-id"), "fixture-account");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-5.6-luna");
    assert.equal(body.stream, true);
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, undefined);
    assert.ok(body.include.includes("reasoning.encrypted_content"));
    assert.equal(body.reasoning.effort, "medium");
    const events = [
      {
        type: "response.created",
        response: { id: "resp_fixture", created_at: 1, model: body.model },
      },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: {
          type: "message",
          id: "msg_fixture",
          role: "assistant",
          content: [],
        },
      },
      {
        type: "response.output_text.delta",
        item_id: "msg_fixture",
        output_index: 0,
        delta: "Fixture response",
      },
      {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          type: "message",
          id: "msg_fixture",
          role: "assistant",
          content: [
            { type: "output_text", text: "Fixture response", annotations: [] },
          ],
        },
      },
      {
        type: "response.completed",
        response: {
          usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 },
        },
      },
    ];
    return new Response(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  try {
    const login = await routeAuth(request("login", undefined, "POST"), f.env);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await routeAuth(request("status", cookie), f.env);
    const model = createChatGPTProxyProvider({
      fetch: async (input, init) => {
        const req = new Request(
          new URL(String(input), "https://oma.test"),
          init,
        );
        req.headers.set("cookie", cookie);
        req.headers.set("origin", "https://oma.test");
        return routeAuth(req, f.env);
      },
    })("gpt-5.6-luna");
    let output = "";
    const history = await runAgent(
      {
        mode: "chatgpt",
        model: "gpt-5.6-luna",
        baseURL: "",
        apiKey: "",
        tools: false,
      },
      [{ role: "user", content: "Fixture" }],
      new AbortController().signal,
      (event) => {
        if (event.type === "text") output += event.text;
      },
      async () => false,
      { model },
    );
    assert.equal(output, "Fixture response");
    assert.equal(history.at(-1)?.role, "assistant");
    assert.equal(calls, 1);
  } finally {
    f.close();
  }
});

test("concurrent requests rotate an expiring token once and send the refreshed credentials", async () => {
  let calls = 0;
  const f = fixture(
    async (_input, init) => {
      calls++;
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer renewed-1",
      );
      assert.equal(
        new Headers(init?.headers).get("chatgpt-account-id"),
        "fixture-account",
      );
      return new Response("data: [DONE]\n\n", {
        headers: { "content-type": "text/event-stream" },
      });
    },
    { initialExpiresIn: 1 },
  );
  try {
    const login = await routeAuth(request("login", undefined, "POST"), f.env);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await routeAuth(request("status", cookie), f.env);
    const send = () =>
      routeAuth(
        new Request("https://oma.test/api/chatgpt/responses", {
          method: "POST",
          headers: {
            cookie,
            origin: "https://oma.test",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-5.6-luna",
            input: [],
            stream: true,
          }),
        }),
        f.env,
      );
    const responses = await Promise.all([send(), send()]);
    assert.deepEqual(
      responses.map((r) => r.status),
      [200, 200],
    );
    assert.equal(f.refreshes, 1);
    assert.equal(calls, 2);
    await Promise.all(responses.map((r) => r.text()));
    await routeAuth(request("logout", cookie, "POST"), f.env);
    assert.equal((await send()).status, 401);
    assert.equal(calls, 2);
  } finally {
    f.close();
  }
});

test("revoked refresh token invalidates the session instead of leaving it falsely authenticated", async () => {
  const f = fixture(
    async () => {
      throw new Error("Must not infer after revoked refresh");
    },
    { initialExpiresIn: 1, refreshFailure: true },
  );
  try {
    const login = await routeAuth(request("login", undefined, "POST"), f.env);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await routeAuth(request("status", cookie), f.env);
    const result = await routeAuth(
      new Request("https://oma.test/api/chatgpt/responses", {
        method: "POST",
        headers: {
          cookie,
          origin: "https://oma.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          input: [],
          stream: true,
        }),
      }),
      f.env,
    );
    assert.equal(result.status, 401);
    assert.match((await result.json()).error.message, /sign in again/i);
    assert.equal(
      (await (await routeAuth(request("session", cookie), f.env)).json())
        .status,
      "unauthenticated",
    );
  } finally {
    f.close();
  }
});

test("temporary refresh failure preserves authorization and reports retryable failure", async () => {
  const f = fixture(
    async () => {
      throw new Error("No inference without refreshed credentials");
    },
    { initialExpiresIn: 1, refreshTemporary: true },
  );
  try {
    const login = await routeAuth(request("login", undefined, "POST"), f.env);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await routeAuth(request("status", cookie), f.env);
    const result = await routeAuth(request("responses", cookie, "POST"), f.env);
    assert.equal(result.status, 503);
    assert.match(
      (await result.json()).error.message,
      /temporarily unavailable/,
    );
    assert.equal(
      (await (await routeAuth(request("session", cookie), f.env)).json())
        .status,
      "authenticated",
    );
  } finally {
    f.close();
  }
});

test("model discovery also clears revoked authorization without affecting a different session", async () => {
  const f = fixture(undefined, { initialExpiresIn: 1, refreshFailure: true });
  try {
    const cookies: string[] = [];
    for (let i = 0; i < 2; i++) {
      const login = await routeAuth(request("login", undefined, "POST"), f.env);
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      cookies.push(cookie);
      await routeAuth(request("status", cookie), f.env);
    }
    const result = await routeAuth(request("models", cookies[0]), f.env);
    assert.equal(result.status, 401);
    assert.equal(
      (await (await routeAuth(request("session", cookies[0]), f.env)).json())
        .status,
      "unauthenticated",
    );
    assert.equal(
      (await (await routeAuth(request("session", cookies[1]), f.env)).json())
        .status,
      "authenticated",
    );
  } finally {
    f.close();
  }
});
