"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Cloud, RotateCw, Square, LogIn } from "lucide-react";
import { useDesktop } from "@/lib/state/store";
import type { RemoteBrowserHandle } from "./RemoteBrowser";
type CloudSession = {
  sessionId: string;
  viewerUrl: string;
  url: string;
  title: string;
  expiresAt: number;
};
type Props = {
  url: string;
  active: boolean;
  onLocation: (url: string, title: string) => void;
};
const endpoint = "/api/browser-runtime";
async function call(action: string, extra: Record<string, unknown> = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
    signal: AbortSignal.timeout(35000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.error || `Cloud browser request failed (HTTP ${response.status}).`,
    );
  return data as CloudSession;
}
let creationQueue = Promise.resolve();
function closeSession(sessionId: string) {
  const closing = creationQueue.then(() =>
    call("close", { sessionId }).catch(() => {}),
  );
  creationQueue = closing.then(() => {});
  return closing;
}
function startSession(
  extra: Record<string, unknown>,
  cancelled: () => boolean,
) {
  const result = creationQueue.then(async () => {
    if (cancelled()) return null;
    const session = await call("start", extra);
    if (cancelled()) {
      await call("close", { sessionId: session.sessionId }).catch(() => {});
      return null;
    }
    const view = new URL(session.viewerUrl);
    if (view.origin !== "https://live.browser.run") {
      await call("close", { sessionId: session.sessionId }).catch(() => {});
      throw new Error(
        "The cloud browser returned an unexpected viewer address.",
      );
    }
    return session;
  });
  creationQueue = result.then(
    () => {},
    () => {},
  );
  return result;
}
export default forwardRef<RemoteBrowserHandle, Props>(function CloudBrowser(
  { url, onLocation },
  ref,
) {
  const host = useRef<HTMLDivElement>(null),
    identity = useRef(crypto.randomUUID()),
    current = useRef<CloudSession | null>(null),
    requestedURL = useRef(url),
    callback = useRef(onLocation),
    alive = useRef(true);
  const [session, setSession] = useState<CloudSession | null>(null),
    [error, setError] = useState(""),
    [starting, setStarting] = useState(true),
    [epoch, setEpoch] = useState(0),
    [stopped, setStopped] = useState(false),
    [remaining, setRemaining] = useState("");
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let intersects = false;
    const updateVisibility = () => setVisible(intersects && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersects =
        entry.isIntersecting &&
        entry.intersectionRect.width > 0 &&
        entry.intersectionRect.height > 0;
      updateVisibility();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);
  callback.current = onLocation;
  const update = (value: CloudSession) => {
    current.current = value;
    setSession(value);
    callback.current(value.url, value.title);
  };
  const action = async (name: string, extra: Record<string, unknown> = {}) => {
    const id = current.current?.sessionId;
    if (!id) return;
    try {
      const value = await call(name, { sessionId: id, ...extra });
      if (alive.current && current.current?.sessionId === id) {
        update(value);
        setError("");
      }
    } catch (error) {
      if (alive.current)
        setError(
          error instanceof Error
            ? error.message
            : "Could not control the cloud browser.",
        );
    }
  };
  const stop = () => {
    const id = current.current?.sessionId;
    current.current = null;
    setSession(null);
    setStopped(true);
    setStarting(false);
    if (id) void closeSession(id);
  };
  useImperativeHandle(ref, () => ({
    action: (name) => {
      void action(name);
    },
    navigate: (next) => {
      if (!current.current) return;
      requestedURL.current = next;
      void action("navigate", { url: next });
    },
    screenshot: async () => {
      const id = current.current?.sessionId;
      if (!id) throw new Error("Start the cloud browser first.");
      const response = await fetch(
        endpoint + "?capture=1&sessionId=" + encodeURIComponent(id),
        { cache: "no-store" },
      );
      if (!response.ok)
        throw new Error("Could not save the cloud browser screenshot.");
      return response.blob();
    },
  }));
  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    setError("");
    setStarting(true);
    setStopped(false);
    const rect = host.current?.getBoundingClientRect();
    void startSession(
      {
        clientId: identity.current,
        url: requestedURL.current,
        width: Math.round(rect?.width || 1024),
        height: Math.round((rect?.height || 768) - 42),
      },
      () => cancelled,
    )
      .then((value) => {
        if (!value) return;
        update(value);
        setStarting(false);
      })
      .catch((error) => {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "The cloud browser could not start.",
          );
          setStarting(false);
        }
      });
    return () => {
      cancelled = true;
      alive.current = false;
      const id = current.current?.sessionId;
      if (current.current) requestedURL.current = current.current.url;
      current.current = null;
      if (id) void closeSession(id);
    };
  }, [epoch]);
  useEffect(() => {
    if (session && url !== requestedURL.current) {
      requestedURL.current = url;
      void action("navigate", { url });
    }
  }, [url, session?.sessionId]);
  useEffect(() => {
    if (!session || !visible) return;
    let cancelled = false;
    let timer = 0;
    const heartbeat = async () => {
      if (cancelled) return;
      if (!document.hidden) {
        try {
          const value = await call("heartbeat", {
            sessionId: session.sessionId,
          });
          if (!cancelled) {
            update(value);
            setError("");
          }
        } catch (error) {
          if (!cancelled) {
            setError(
              error instanceof Error
                ? error.message
                : "Cloud browser session ended.",
            );
            return;
          }
        }
      }
      if (!cancelled) timer = window.setTimeout(heartbeat, 30000);
    };
    // Refresh immediately when a page becomes visible again, before its idle lease expires.
    void heartbeat();
    const onDocumentVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void heartbeat();
      }
    };
    document.addEventListener("visibilitychange", onDocumentVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onDocumentVisible);
    };
  }, [session?.sessionId, visible]);
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((session.expiresAt - Date.now()) / 1000),
      );
      setRemaining(
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
      );
      if (!seconds) {
        stop();
        setError(
          "The cloud browser reached its session limit. Start a new session to continue.",
        );
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session?.sessionId]);
  useEffect(() => {
    if (!session || !host.current || !visible) return;
    let timer = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width < 1 || entry.contentRect.height < 1) return;
      clearTimeout(timer);
      timer = window.setTimeout(
        () =>
          void action("resize", {
            width: Math.round(entry.contentRect.width),
            height: Math.round(entry.contentRect.height - 42),
          }),
        300,
      );
    });
    observer.observe(host.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [session?.sessionId, visible]);
  return (
    <div className="cloud-browser" ref={host} data-visible={visible}>
      {session ? (
        <>
          <iframe
            title="Cloudflare live browser"
            src={session.viewerUrl}
            sandbox="allow-scripts allow-forms allow-same-origin"
            allow="clipboard-read; clipboard-write; fullscreen"
            referrerPolicy="no-referrer"
          />
          <div className="cloud-browser-session">
            <span>
              <Cloud size={12} />
              Cloudflare · {remaining} remaining
            </span>
            <button onClick={stop}>
              <Square size={11} />
              End session
            </button>
          </div>
        </>
      ) : (
        <div className="cloud-browser-empty">
          <Cloud size={28} />
          <h2>
            {starting
              ? "Starting your cloud browser…"
              : stopped
                ? "Cloud browser stopped"
                : "Cloud browser"}
          </h2>
          <p>
            {error ||
              (starting
                ? "A real browser running on Cloudflare."
                : "Sign in with ChatGPT in Agent to browse here. Usage counts toward this deployment’s Browser Run allowance.")}
          </p>
          {!starting && (
            <div>
              <button onClick={() => setEpoch((value) => value + 1)}>
                <RotateCw size={13} />
                {stopped ? "Start browser" : "Connect"}
              </button>
              {/sign in/i.test(error) && (
                <button onClick={() => useDesktop.getState().launch("agent")}>
                  <LogIn size={13} />
                  Open Agent to sign in
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {session && error && (
        <div className="cloud-browser-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setEpoch((value) => value + 1)}>
            <RotateCw size={13} />
            Reconnect
          </button>
          <button onClick={stop}>End session</button>
        </div>
      )}
    </div>
  );
});
