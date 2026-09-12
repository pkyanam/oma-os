import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../../../package.json", import.meta.url),
);
const { Miniflare, convertV4MiniflareOptions } = require("miniflare"),
  { build } = require("esbuild");
const authPath = fileURLToPath(new URL("../src/auth.ts", import.meta.url));
const rootPath = fileURLToPath(new URL("../../../", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "oma-workerd-auth-"));
const inject = join(dir, "fake.mjs");
await writeFile(
  inject,
  `export async function __testFetch(input,init){const url=String(input);if(url.endsWith('/deviceauth/usercode'))return Response.json({device_auth_id:crypto.randomUUID(),user_code:'FIXTURE',interval:1});if(url.endsWith('/deviceauth/token'))return Response.json({authorization_code:JSON.parse(init.body).device_auth_id,code_verifier:'fixture',code_challenge:'fixture'});if(url.endsWith('/oauth/token')){const id=new URLSearchParams(init.body).get('code');const jwt='e30.'+btoa(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:id}})).replaceAll('=','')+'.fixture';return Response.json({access_token:'fixture-access-'+id,refresh_token:'fixture-refresh',id_token:jwt,expires_in:3600});}if(url.includes('/responses'))return new Response('data: {\"type\":\"response.completed\"}\\n\\n',{headers:{'content-type':'text/event-stream'}});throw new Error('Unexpected fixture transport');}`,
);
const output = await build({
  stdin: {
    contents: `import {AuthSession,routeAuth} from ${JSON.stringify(authPath)};export {AuthSession};export default {fetch(request,env){return routeAuth(request,env)}};`,
    resolveDir: rootPath,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["cloudflare:workers"],
  define: { fetch: "__testFetch" },
  inject: [inject],
  write: false,
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: output.outputFiles[0].text,
    compatibilityDate: "2026-06-01",
    durableObjects: {
      AUTH_SESSIONS: { className: "AuthSession", useSQLite: true },
    },
    bindings: { LWC_SECRET: "workerd-fixture-secret-at-least-32-characters" },
  }),
);
try {
  const get = await mf.dispatchFetch("https://oma.test/api/chatgpt/session");
  assert.equal((await get.json()).status, "unauthenticated");
  const login = () =>
    mf.dispatchFetch("https://oma.test/api/chatgpt/login", {
      method: "POST",
      headers: { origin: "https://oma.test" },
    });
  const results = await Promise.all([login(), login()]);
  const cookies = results.map((r) => {
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie").split(";")[0];
  });
  assert.notEqual(cookies[0], cookies[1]);
  for (const cookie of cookies) {
    const response = await mf.dispatchFetch(
      "https://oma.test/api/chatgpt/status",
      { headers: { cookie } },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "authenticated");
  }
  const streamed = await mf.dispatchFetch(
    "https://oma.test/api/chatgpt/responses",
    {
      method: "POST",
      headers: {
        origin: "https://oma.test",
        cookie: cookies[0],
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "fixture", input: "hello" }),
    },
  );
  assert.equal(streamed.status, 200);
  assert.match(streamed.headers.get("content-type"), /text\/event-stream/);
  assert.match(await streamed.text(), /response.completed/);
  const logout = await mf.dispatchFetch("https://oma.test/api/chatgpt/logout", {
    method: "POST",
    headers: { origin: "https://oma.test", cookie: cookies[0] },
  });
  assert.equal(logout.status, 200);
  const left = await mf.dispatchFetch("https://oma.test/api/chatgpt/session", {
    headers: { cookie: cookies[0] },
  });
  assert.equal((await left.json()).status, "unauthenticated");
  const right = await mf.dispatchFetch("https://oma.test/api/chatgpt/session", {
    headers: { cookie: cookies[1] },
  });
  assert.equal((await right.json()).status, "authenticated");
  console.log(
    "PASS: actual workerd SQLite DOs; two logins, routing, token progression, isolated logout",
  );
} finally {
  await mf.dispose();
  await rm(dir, { recursive: true, force: true });
}
