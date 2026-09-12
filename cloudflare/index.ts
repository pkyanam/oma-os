import { routeAI, aiEnabled, WORKERS_AI_MODEL, AI_LIMITS } from './ai';
export { AIQuota } from './ai';
import {
  routeAuth,
  authenticatedIdentity,
} from "../companions/cloudflare-app/src/auth";
import { verifiedSession } from "../companions/cloudflare-app/src/auth-core";
import {
  closeCloudBrowser,
  routeCloudBrowser,
} from "../companions/cloudflare-app/src/browser";
import { documentResponse } from "./documents";
import { pythonAssetResponse } from "./python-assets";
export { AuthSession } from "../companions/cloudflare-app/src/auth";
export { BrowserSession } from "../companions/cloudflare-app/src/browser";
interface Env {
  AI?: Ai;
  AI_QUOTA?: DurableObjectNamespace;
  ASSETS: Fetcher;
  AUTH_SESSIONS: DurableObjectNamespace;
  LWC_SECRET: string;
  API_LIMITER: RateLimit;
  BROWSER: Fetcher;
  BROWSER_SESSIONS: DurableObjectNamespace;
}
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname;
    if (path.startsWith("/runtime/pyodide/"))
      return pythonAssetResponse(request, ctx);
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    const origin = request.headers.get("origin");
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && origin !== url.origin)
    )
      return json({ error: "Cross-origin API requests are not allowed." }, 403);
    if (!["GET", "POST", "OPTIONS"].includes(request.method))
      return json({ error: "Method not allowed." }, 405);
    if (path === "/api/health")
      return json({ ok: true, version: "0.1.0", platform: "cloudflare" });
    if (path === "/api/agent-config")
      return json({
        chatgpt: {
          enabled: !!env.LWC_SECRET,
          storage: "durable-objects",
          ...(!env.LWC_SECRET
            ? {
                reason:
                  "Set the deployment authentication secret to enable sign-in.",
              }
            : {}),
        },
        workersAI: { enabled: aiEnabled(env), models: [WORKERS_AI_MODEL], limits: AI_LIMITS },
        direct: true,
        platform: "cloudflare",
      });
    if (path === "/api/mcp")
      return json(
        {
          error:
            "Remote MCP is not implemented. Use the built-in agent contract.",
        },
        501,
      );
    if (path === "/api/browser" || path === "/api/chatgpt/login") {
      const ip = request.headers.get("CF-Connecting-IP") || "local";
      if (
        env.API_LIMITER &&
        !(await env.API_LIMITER.limit({ key: path + ":" + ip })).success
      )
        return json({ error: "Too many requests. Try again shortly." }, 429);
    }
    try {
      if (path === '/api/ai/v1/chat/completions') return await routeAI(request, env, ctx);
      if (path === "/api/browser-runtime")
        return await routeCloudBrowser(
          request,
          env,
          env.LWC_SECRET
            ? await authenticatedIdentity(request, env)
            : undefined,
        );
      if (path.startsWith("/api/chatgpt/")) {
        if (!env.LWC_SECRET)
          return json({ error: "Authentication is not configured." }, 503);
        const response = await routeAuth(request, env);
        if (
          path === "/api/chatgpt/logout" &&
          request.method === "POST" &&
          response.ok
        ) {
          ctx.waitUntil(
            verifiedSession(request, env.LWC_SECRET)
              .then((id) => (id ? closeCloudBrowser(env, id) : undefined))
              .catch(() => {}),
          );
        }
        return response;
      }
      if (path === "/api/browser" && request.method === "GET")
        return await documentResponse(request);
      return json({ error: "Unknown endpoint." }, 404);
    } catch {
      return json(
        { error: "The service could not complete this request. Please retry." },
        503,
      );
    }
  },
} satisfies ExportedHandler<Env>;
