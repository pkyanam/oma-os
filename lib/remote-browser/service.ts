import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { remoteURL } from "../browser/fetch";
import { publicDestination } from "./network";
import { startPublicProxy } from "./proxy";
export class RuntimeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type Session = {
  id: string;
  owner: string;
  context: BrowserContext;
  page: Page;
  lastSeen: number;
  loading: boolean;
  queue: Promise<unknown>;
  frame?: Promise<Buffer>;
};
type RuntimeState = {
  schemaVersion?: number;
  pending?: Map<string, number>;
  browser?: Promise<Browser>;
  proxy?: Awaited<ReturnType<typeof startPublicProxy>>;
  sessions: Map<string, Session>;
  timer?: ReturnType<typeof setInterval>;
};
const globalState = globalThis as typeof globalThis & {
  __omaBrowserRuntime?: RuntimeState;
};
const state: RuntimeState = (globalState.__omaBrowserRuntime ??= {
  sessions: new Map(),
});
const TTL = 15 * 60 * 1000;
export function capabilities() {
  if (process.env.OMA_BROWSER_CDP_URL && !process.env.OMA_BROWSER_PROXY_URL)
    return {
      available: false,
      reason:
        "External Chromium requires OMA_BROWSER_PROXY_URL pointing to a public-only egress proxy reachable by that browser.",
    };
  if (process.env.VERCEL)
    return {
      available: false,
      reason:
        "Interactive Chromium requires a persistent self-hosted Node server. Serverless deployments support Document and Embed modes.",
    };
  if (
    process.env.NODE_ENV === "production" &&
    process.env.OMA_BROWSER_ENABLED !== "1"
  )
    return {
      available: false,
      reason:
        "Set OMA_BROWSER_ENABLED=1 on a private self-hosted server to enable interactive Chromium.",
    };
  if (process.env.OMA_BROWSER_ENABLED === "0")
    return {
      available: false,
      reason: "Interactive Chromium was disabled by the server owner.",
    };
  if (
    !process.env.OMA_BROWSER_CDP_URL &&
    !existsSync(chromium.executablePath())
  )
    return {
      available: false,
      reason:
        "Install the bundled browser with npx playwright install chromium.",
    };
  return {
    available: true,
    reason:
      "Isolated Chromium sessions render websites inside oma.os. Sessions expire after 15 minutes idle.",
  };
}
async function browser() {
  // Retire a pre-proxy instance during development hot reloads.
  if (state.browser && state.schemaVersion !== 2) {
    await (await state.browser).close().catch(() => {});
    state.browser = undefined;
  }
  state.schemaVersion = 2;
  if (!state.browser) {
    state.browser = (async () => {
      if (!process.env.OMA_BROWSER_CDP_URL && !state.proxy)
        state.proxy = await startPublicProxy();
      const instance = process.env.OMA_BROWSER_CDP_URL
        ? await chromium.connectOverCDP(process.env.OMA_BROWSER_CDP_URL, {
            timeout: 15000,
          })
        : await chromium.launch({
            headless: true,
            chromiumSandbox: true,
            proxy: {
              server: process.env.OMA_BROWSER_PROXY_URL || state.proxy!.url,
              bypass: "<-loopback>",
            },
            args: [
              "--disable-quic",
              "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
              "--disable-background-networking",
            ],
          });
      instance.on("disconnected", () => {
        state.browser = undefined;
        state.sessions.clear();
      });
      return instance;
    })().catch((error) => {
      state.browser = undefined;
      throw error;
    });
  }
  return state.browser;
}
export async function closeSession(session: Session) {
  state.sessions.delete(session.id);
  await session.context.close().catch(() => {});
}
function armCleanup() {
  if (state.timer) return;
  state.timer = setInterval(() => {
    for (const session of state.sessions.values())
      if (Date.now() - session.lastSeen > TTL) void closeSession(session);
  }, 60000);
  state.timer.unref();
}
export function getSession(id: string, owner: string) {
  const session = state.sessions.get(id);
  if (!session || session.owner !== owner)
    throw new RuntimeError(
      "Browser session expired. Reconnect to continue.",
      404,
    );
  session.lastSeen = Date.now();
  return session;
}
function dimension(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(Math.max(min, Math.min(max, value)))
    : fallback;
}
export async function startSession(
  owner: string,
  input: Record<string, unknown>,
) {
  const pending = (state.pending ??= new Map<string, number>());
  const mine = pending.get(owner) || 0;
  const owned = [...state.sessions.values()].filter(
    (s) => s.owner === owner,
  ).length;
  const total = [...pending.values()].reduce((a, b) => a + b, 0);
  if (owned + mine >= 3)
    throw new RuntimeError(
      "Close another browser window before starting a fourth session.",
      429,
    );
  if (state.sessions.size + total >= 12)
    throw new RuntimeError("The browser server is at capacity.", 503);
  pending.set(owner, mine + 1);
  try {
    return await createSession(owner, input);
  } finally {
    const remaining = (pending.get(owner) || 1) - 1;
    if (remaining) pending.set(owner, remaining);
    else pending.delete(owner);
  }
}
async function createSession(owner: string, input: Record<string, unknown>) {
  const cap = capabilities();
  if (!cap.available) throw new RuntimeError(cap.reason, 503);
  const existing = [...state.sessions.values()].filter(
    (s) => s.owner === owner,
  );
  if (existing.length >= 3)
    throw new RuntimeError(
      "Close another browser window before starting a fourth session.",
      429,
    );
  if (state.sessions.size >= 12)
    throw new RuntimeError(
      "The browser server is at capacity. Try again later.",
      503,
    );
  let url: string;
  try {
    url = remoteURL(String(input.url || "https://www.google.com")).href;
  } catch {
    throw new RuntimeError(
      "Enter a public HTTP(S) address on a standard web port.",
    );
  }
  const instance = await browser();
  const context = await instance.newContext({
    viewport: {
      width: dimension(input.width, 1024, 320, 1920),
      height: dimension(input.height, 720, 240, 1200),
    },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    acceptDownloads: false,
    permissions: [],
    proxy: {
      server: process.env.OMA_BROWSER_PROXY_URL || state.proxy!.url,
      bypass: "<-loopback>",
    },
  });
  try {
    await context.route("**/*", async (route) => {
      try {
        remoteURL(route.request().url());
        await route.continue();
      } catch {
        await route.abort("blockedbyclient").catch(() => {});
      }
    });
    await context.addInitScript(() => {
      for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection"])
        Object.defineProperty(globalThis, name, {
          value: undefined,
          configurable: false,
        });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(15000);
    const session: Session = {
      id: randomBytes(24).toString("hex"),
      owner,
      context,
      page,
      lastSeen: Date.now(),
      loading: false,
      queue: Promise.resolve(),
    };
    context.on("page", (popup) => {
      if (popup !== page) {
        void (async () => {
          await popup
            .waitForLoadState("domcontentloaded", { timeout: 10000 })
            .catch(() => {});
          const destination = popup.url();
          await popup.close();
          if (/^https?:/.test(destination))
            await navigate(session, destination).catch(() => {});
        })();
      }
    });
    page.on("dialog", (dialog) => void dialog.dismiss());
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        session.loading = true;
    });
    page.on("load", () => {
      session.loading = false;
    });
    page.on("requestfailed", (request) => {
      if (request.isNavigationRequest()) session.loading = false;
    });
    state.sessions.set(session.id, session);
    armCleanup();
    await navigate(session, url);
    return session;
  } catch (error) {
    for (const session of state.sessions.values())
      if (session.context === context) state.sessions.delete(session.id);
    await context.close();
    throw error;
  }
}
async function navigate(session: Session, url: string) {
  try {
    await publicDestination(url);
  } catch {
    throw new RuntimeError(
      "Only public HTTP(S) websites are available. Local and private addresses are blocked.",
    );
  }
  session.loading = true;
  try {
    await session.page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (
      session.page.url() === "about:blank" ||
      session.page.url().startsWith("chrome-error:") ||
      !(error instanceof Error && error.message.includes("Timeout"))
    )
      throw new RuntimeError(
        "This website could not load. Check the address and retry; private network pages are unavailable.",
        502,
      );
  } finally {
    session.loading = false;
  }
}
export async function sessionInfo(session: Session) {
  return {
    sessionId: session.id,
    url: session.page.url(),
    title: await session.page.title().catch(() => ""),
    loading: session.loading,
  };
}
export async function perform(
  session: Session,
  input: Record<string, unknown>,
) {
  const operation = async () => {
    const page = session.page;
    switch (input.action) {
      case "navigate":
        await navigate(session, String(input.url || ""));
        break;
      case "back":
        await page.goBack({ waitUntil: "domcontentloaded" });
        break;
      case "forward":
        await page.goForward({ waitUntil: "domcontentloaded" });
        break;
      case "reload":
        await page.reload({ waitUntil: "domcontentloaded" });
        break;
      case "click":
        await page.mouse.click(
          dimension(input.x, 0, 0, 1920),
          dimension(input.y, 0, 0, 1200),
          {
            button: input.button === "right" ? "right" : "left",
            clickCount: input.clickCount === 2 ? 2 : 1,
          },
        );
        break;
      case "pointer": {
        if (typeof input.x === "number" && typeof input.y === "number")
          await page.mouse.move(
            dimension(input.x, 0, 0, 1920),
            dimension(input.y, 0, 0, 1200),
          );
        const button =
          input.button === "right"
            ? "right"
            : input.button === "middle"
              ? "middle"
              : "left";
        if (input.phase === "down") await page.mouse.down({ button });
        if (input.phase === "up") await page.mouse.up({ button });
        break;
      }
      case "scroll":
        if (typeof input.x === "number" && typeof input.y === "number")
          await page.mouse.move(
            dimension(input.x, 0, 0, 1920),
            dimension(input.y, 0, 0, 1200),
          );
        await page.mouse.wheel(
          dimension(input.deltaX, 0, -4000, 4000),
          dimension(input.deltaY, 0, -4000, 4000),
        );
        break;
      case "key": {
        const raw = String(input.key || "");
        if (raw.length > 40) throw new RuntimeError("Unsupported key.");
        const modifiers = Array.isArray(input.modifiers)
          ? input.modifiers.filter((v): v is string =>
              ["Shift", "Control", "Meta", "Alt"].includes(String(v)),
            )
          : [];
        const key = raw === " " ? "Space" : raw;
        await page.keyboard.press(
          [
            ...modifiers.map((m) =>
              m === "Meta" && process.platform !== "darwin" ? "Control" : m,
            ),
            key,
          ].join("+"),
        );
        break;
      }
      case "type": {
        const text = String(input.text || "");
        if (text.length > 10000)
          throw new RuntimeError("Text exceeds 10,000 characters.");
        await page.keyboard.insertText(text);
        break;
      }
      case "resize":
        await page.setViewportSize({
          width: dimension(input.width, 1024, 320, 1920),
          height: dimension(input.height, 720, 240, 1200),
        });
        break;
      case "close":
        await closeSession(session);
        return { closed: true };
      default:
        throw new RuntimeError("Unknown browser action.");
    }
    return sessionInfo(session);
  };
  const result = session.queue.then(operation);
  session.queue = result.catch(() => {});
  return result;
}
export async function screenshot(session: Session) {
  if (!session.frame)
    session.frame = session.page
      .screenshot({
        type: "jpeg",
        quality: 72,
        timeout: 10000,
        animations: "disabled",
      })
      .finally(() => {
        session.frame = undefined;
      });
  return session.frame;
}
