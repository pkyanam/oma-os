import { DurableObject } from "cloudflare:workers";
import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";
export interface BrowserEnv {
  BROWSER: Fetcher;
  BROWSER_SESSIONS: DurableObjectNamespace;
}
type Tab = {
  id: string;
  clientId: string;
  targetId: string;
  viewerUrl: string;
  lastSeen: number;
};
type Session = { managedId: string; expiresAt: number; tabs: Tab[] };
const LIFETIME = 15 * 60_000,
  IDLE = 75_000;
class BrowserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
function fail(error: unknown) {
  if (error instanceof BrowserError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  const message = error instanceof Error ? error.message : "";
  if (/429|limit exceeded|too many|concurrent|allowance/i.test(message))
    return Response.json(
      {
        error:
          "Cloudflare browser capacity or account allowance is exhausted. Try again later or review the deployment’s Browser Run limits.",
      },
      {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      },
    );
  if (/closed|not found|expired|session.*invalid|404/i.test(message))
    return Response.json(
      { error: "This cloud browser session ended. Reconnect to continue." },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    {
      error:
        "Cloudflare could not complete this browser request. Reconnect or try again shortly.",
    },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}
function urlInput(value: unknown) {
  if (typeof value !== "string" || value.length > 4096)
    throw new BrowserError("Enter a public website address.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BrowserError("Enter a valid website address.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !["", "80", "443"].includes(url.port) ||
    url.hostname === "localhost" ||
    /\.(localhost|local|internal)$/.test(url.hostname) ||
    /^[\d.]+$/.test(url.hostname) ||
    url.hostname.includes(":")
  )
    throw new BrowserError(
      "Use a public HTTP(S) website with no credentials or custom port.",
    );
  return url.href;
}
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new BrowserError("JSON input required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 32768) {
      await reader.cancel();
      throw new BrowserError("Browser input exceeds 32 KB.", 413);
    }
    chunks.push(chunk.value);
  }
  try {
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    const parsed = JSON.parse(new TextDecoder().decode(joined));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw 0;
    return parsed as Record<string, unknown>;
  } catch {
    throw new BrowserError("Invalid JSON input.");
  }
}
async function navigation(page: Page, operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    // A slow DOMContentLoaded event does not mean the visible browser failed.
    if (!(
      error instanceof Error &&
      error.name === "TimeoutError" &&
      /^https?:/.test(page.url())
    ))
      throw error;
  }
}
function viewport(input: Record<string, unknown>) {
  return {
    width: Math.max(
      320,
      Math.min(1920, Math.round(Number(input.width) || 1024)),
    ),
    height: Math.max(
      240,
      Math.min(1200, Math.round(Number(input.height) || 720)),
    ),
  };
}
export async function routeCloudBrowser(
  request: Request,
  env: BrowserEnv,
  identity: string | undefined,
) {
  const url = new URL(request.url);
  if (!env.BROWSER || !env.BROWSER_SESSIONS) {
    const reason =
      "Managed browsing requires a Cloudflare deployment or explicit remote browser development. Document mode remains available.";
    return Response.json(
      request.method === "GET" && url.searchParams.has("capabilities")
        ? { available: false, requiresAuthentication: false, reason }
        : { error: reason },
      {
        status:
          request.method === "GET" && url.searchParams.has("capabilities")
            ? 200
            : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  if (request.method === "GET" && url.searchParams.has("capabilities"))
    return Response.json(
      {
        available: !!identity,
        provider: "cloudflare",
        transport: "live-view",
        requiresAuthentication: !identity,
        reason: identity
          ? "Managed Cloudflare browser. Usage counts toward the deployment’s Browser Run allowance."
          : "Sign in with ChatGPT in Agent settings to start a cloud browser.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  if (!identity)
    return Response.json(
      {
        error:
          "Sign in with ChatGPT in Agent settings before starting a cloud browser.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (request.headers.get("origin") &&
      request.headers.get("origin") !== url.origin)
  )
    return Response.json(
      { error: "Cross-origin browser control is not allowed." },
      { status: 403 },
    );
  if (request.method === "POST" && request.headers.get("origin") !== url.origin)
    return Response.json(
      { error: "Same-origin browser control is required." },
      { status: 403 },
    );
  if (!["GET", "POST"].includes(request.method))
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  const headers = new Headers(request.headers);
  headers.delete("x-oma-browser-cleanup");
  headers.set("x-oma-browser-owner", identity);
  return env.BROWSER_SESSIONS.get(
    env.BROWSER_SESSIONS.idFromName(identity),
  ).fetch(new Request(request, { headers }));
}
/** Called only after successful logout; the identity is a verified signed SID.
 * This revokes an existing browser even if a previously authorized start is queued. */
export async function closeCloudBrowser(env: BrowserEnv, identity: string) {
  if (!env.BROWSER || !env.BROWSER_SESSIONS) return;
  const response = await env.BROWSER_SESSIONS.get(
    env.BROWSER_SESSIONS.idFromName(identity),
  ).fetch(
    new Request("https://browser-session.internal/logout", {
      method: "POST",
      headers: {
        "x-oma-browser-owner": identity,
        "x-oma-browser-cleanup": "logout",
      },
    }),
  );
  if (!response.ok) throw new Error("Browser cleanup did not complete.");
}
export class BrowserSession extends DurableObject<BrowserEnv> {
  private session: Session | undefined;
  private revoked = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(ctx: DurableObjectState, env: BrowserEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.session = await ctx.storage.get<Session>("browser");
      this.revoked = !!(await ctx.storage.get<boolean>("revoked"));
    });
  }
  async fetch(request: Request) {
    const owner = request.headers.get("x-oma-browser-owner");
    if (
      !owner ||
      this.env.BROWSER_SESSIONS.idFromName(owner).toString() !==
        this.ctx.id.toString()
    )
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    const task = this.queue.then(() => this.handle(request));
    this.queue = task.catch(() => {});
    return task.catch(fail);
  }
  private async persist() {
    if (this.session) {
      await this.ctx.storage.put("browser", this.session);
      await this.ctx.storage.setAlarm(
        Math.min(
          this.session.expiresAt,
          ...this.session.tabs.map((tab) => tab.lastSeen + IDLE),
        ),
      );
    } else {
      await this.ctx.storage.delete("browser");
      await this.ctx.storage.deleteAlarm();
    }
  }
  private async connected<T>(fn: (browser: Browser) => Promise<T>) {
    if (!this.session)
      throw new BrowserError(
        "This cloud browser session ended. Reconnect to continue.",
        410,
      );
    const browser = await puppeteer.connect(
      this.env.BROWSER,
      this.session.managedId,
    );
    try {
      return await fn(browser);
    } finally {
      browser.disconnect();
    }
  }
  private async page(browser: Browser, tab: Tab) {
    for (const page of await browser.pages()) {
      const cdp = await page.createCDPSession();
      try {
        const { targetInfo } = await cdp.send("Target.getTargetInfo");
        if (targetInfo.targetId === tab.targetId) return page;
      } finally {
        await cdp.detach().catch(() => {});
      }
    }
    throw new BrowserError(
      "This browser tab closed. Reconnect to continue.",
      410,
    );
  }
  private async info(page: Page, tab: Tab) {
    return {
      sessionId: tab.id,
      viewerUrl: tab.viewerUrl,
      url: page.url(),
      title: await page.title().catch(() => ""),
      expiresAt: this.session!.expiresAt,
    };
  }
  private async closeAll() {
    const current = this.session;
    this.session = undefined;
    await this.persist();
    if (current) {
      const browser = await puppeteer
        .connect(this.env.BROWSER, current.managedId)
        .catch(() => null);
      await browser?.close().catch(() => {});
    }
  }
  async alarm() {
    const task = this.queue.then(async () => {
      if (!this.session) return;
      if (Date.now() >= this.session.expiresAt) {
        await this.closeAll();
        return;
      }
      const expired = this.session.tabs.filter(
        (tab) => Date.now() - tab.lastSeen >= IDLE,
      );
      if (!expired.length) {
        await this.persist();
        return;
      }
      await this.connected(async (browser) => {
        for (const tab of expired) {
          const page = await this.page(browser, tab).catch(() => null);
          await page?.close().catch(() => {});
        }
      }).catch(() => {});
      this.session.tabs = this.session.tabs.filter(
        (tab) => !expired.includes(tab),
      );
      if (!this.session.tabs.length) await this.closeAll();
      else await this.persist();
    });
    this.queue = task.catch(() => {});
    return task;
  }
  private async start(input: Record<string, unknown>) {
    const url = urlInput(input.url),
      clientId = input.clientId;
    if (
      typeof clientId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(clientId)
    )
      throw new BrowserError("A valid browser tab identity is required.");
    if (this.session && Date.now() >= this.session.expiresAt)
      await this.closeAll();
    if (this.session) {
      try {
        const check = await puppeteer.connect(
          this.env.BROWSER,
          this.session.managedId,
        );
        check.disconnect();
      } catch (error) {
        if (
          /closed|not found|expired|session.*invalid|404/i.test(
            error instanceof Error ? error.message : "",
          )
        ) {
          this.session = undefined;
          await this.persist();
        } else throw error;
      }
    }
    const existing = this.session?.tabs.find(
      (tab) => tab.clientId === clientId,
    );
    if (existing) {
      existing.lastSeen = Date.now();
      await this.persist();
      try {
        return await this.connected(async (browser) =>
          this.info(await this.page(browser, existing), existing),
        );
      } catch (error) {
        if (!(error instanceof BrowserError && error.status === 410))
          throw error;
        this.session!.tabs = this.session!.tabs.filter(
          (tab) => tab !== existing,
        );
        await this.persist();
      }
    }
    if (this.session && this.session.tabs.length >= 4)
      throw new BrowserError(
        "Close a cloud browser tab before opening another. Each sign-in session can run four tabs.",
        429,
      );
    let browser: Browser;
    if (this.session)
      browser = await puppeteer.connect(
        this.env.BROWSER,
        this.session.managedId,
      );
    else {
      browser = await puppeteer.launch(this.env.BROWSER, {
        keep_alive: 120000,
      });
      this.session = {
        managedId: browser.sessionId(),
        expiresAt: Date.now() + LIFETIME,
        tabs: [],
      };
      await this.ctx.storage.put("browser", this.session);
      await this.ctx.storage.setAlarm(Date.now() + IDLE);
    }
    let page: Page | undefined;
    try {
      page = await browser.newPage();
      await page.setViewport(viewport(input));
      await navigation(page, () =>
        page!.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }),
      );
      const cdp = await page.createCDPSession();
      const { targetInfo } = await cdp.send("Target.getTargetInfo");
      const view = await cdp.send("Cloudflare.getLiveView", {
        mode: "tab",
        expiresInMs: Math.max(1000, this.session.expiresAt - Date.now()),
      });
      await cdp.detach();
      const tab: Tab = {
        id: crypto.randomUUID(),
        clientId,
        targetId: targetInfo.targetId,
        viewerUrl: view.devtoolsFrontendUrl,
        lastSeen: Date.now(),
      };
      this.session.tabs.push(tab);
      await this.persist();
      return await this.info(page, tab);
    } catch (error) {
      await page?.close().catch(() => {});
      if (!this.session.tabs.length) {
        await browser.close().catch(() => {});
        this.session = undefined;
        await this.persist();
      }
      throw error;
    } finally {
      browser.disconnect();
    }
  }
  private async handle(request: Request): Promise<Response> {
    if (request.headers.get("x-oma-browser-cleanup") === "logout") {
      this.revoked = true;
      await this.ctx.storage.put("revoked", true);
      await this.closeAll();
      return Response.json(
        { closed: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (this.revoked)
      throw new BrowserError(
        "This sign-in session ended. Sign in again to start a browser.",
        401,
      );
    const params = new URL(request.url).searchParams;
    const input =
      request.method === "POST"
        ? await body(request)
        : {
            action: params.has("capture") ? "capture" : "heartbeat",
            sessionId: params.get("sessionId"),
          };
    if (input.action === "start")
      return Response.json(await this.start(input), {
        headers: { "Cache-Control": "no-store" },
      });
    if (!this.session || Date.now() >= this.session.expiresAt) {
      if (this.session) await this.closeAll();
      throw new BrowserError(
        "This cloud browser session expired. Reconnect to continue.",
        410,
      );
    }
    const tab = this.session.tabs.find((item) => item.id === input.sessionId);
    if (!tab)
      throw new BrowserError(
        "This cloud browser tab expired or belongs to another session.",
        410,
      );
    if (input.action === "close") {
      await this.connected(async (browser) => {
        const page = await this.page(browser, tab).catch(() => null);
        await page?.close().catch(() => {});
      }).catch(() => {});
      this.session.tabs = this.session.tabs.filter((item) => item !== tab);
      if (!this.session.tabs.length) await this.closeAll();
      else await this.persist();
      return Response.json({ closed: true });
    }
    const result = await this.connected(async (browser) => {
      const page = await this.page(browser, tab);
      switch (input.action) {
        case "heartbeat":
          await browser.version();
          break;
        case "navigate":
          await navigation(page, () =>
            page.goto(urlInput(input.url), {
              waitUntil: "domcontentloaded",
              timeout: 20000,
            }),
          );
          break;
        case "back":
          await navigation(page, () =>
            page.goBack({ waitUntil: "domcontentloaded", timeout: 20000 }),
          );
          break;
        case "forward":
          await navigation(page, () =>
            page.goForward({ waitUntil: "domcontentloaded", timeout: 20000 }),
          );
          break;
        case "reload":
          await navigation(page, () =>
            page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }),
          );
          break;
        case "resize":
          await page.setViewport(viewport(input));
          break;
        case "capture":
          return new Response(
            new Uint8Array(
              await page.screenshot({ type: "jpeg", quality: 75 }),
            ),
            {
              headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "no-store",
              },
            },
          );
        default:
          throw new BrowserError("Unsupported cloud browser action.");
      }
      return Response.json(await this.info(page, tab), {
        headers: { "Cache-Control": "no-store" },
      });
    });
    tab.lastSeen = Date.now();
    await this.persist();
    return result;
  }
}
