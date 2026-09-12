"use client";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Globe, Keyboard, RotateCw, BookOpen, X } from "lucide-react";
import { BrowserInputQueue } from "@/lib/browser/input-queue";
export type RemoteBrowserHandle = {
  action: (action: "back" | "forward" | "reload") => void;
  screenshot: () => Promise<Blob>;
  navigate: (url: string) => void;
};
type Props = {
  url: string;
  active: boolean;
  onLocation: (url: string, title: string) => void;
  onError?: (message: string) => void;
  onReadDocument?: () => void;
};
const ENDPOINT = "/api/browser-runtime";
// Serialize creation so the first owner cookie exists before another tab starts.
// This also handles React development mount/cleanup/remount without owner races.
let startQueue = Promise.resolve();
function startSession(
  payload: Record<string, unknown>,
  cancelled: () => boolean,
) {
  const result = startQueue.then(async () => {
    if (cancelled()) return null;
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", ...payload }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        data?.error ||
          `Browser runtime is unavailable (HTTP ${response.status}).`,
      );
    if (typeof data?.sessionId !== "string")
      throw new Error(
        "The browser did not return a session. Try reconnecting.",
      );
    return data as { sessionId: string };
  });
  startQueue = result.then(
    () => {},
    () => {},
  );
  return result;
}
/** The image is a real Chromium viewport. Input goes to its isolated session. */
export default forwardRef<RemoteBrowserHandle, Props>(function RemoteBrowser(
  { url, active, onLocation, onError, onReadDocument },
  ref,
) {
  const surface = useRef<HTMLDivElement>(null),
    keyboard = useRef<HTMLTextAreaElement>(null),
    session = useRef<string | null>(null),
    queue = useRef<BrowserInputQueue | null>(null),
    lastURL = useRef(url),
    locationCallback = useRef(onLocation),
    errorCallback = useRef(onError),
    alive = useRef(true),
    composition = useRef(false),
    pointer = useRef<number | null>(null),
    touchGesture = useRef<{
      x: number;
      y: number;
      startX: number;
      startY: number;
      moved: boolean;
    } | null>(null),
    lastMove = useRef(0),
    dimensions = useRef({ width: 1024, height: 768 });
  const [image, setImage] = useState(""),
    [frameMetadata, setFrameMetadata] = useState({ url: "", loading: true }),
    [error, setError] = useState(""),
    [inputNotice, setInputNotice] = useState(""),
    [status, setStatus] = useState("Starting an isolated browser…"),
    [retry, setRetry] = useState(0),
    [ready, setReady] = useState(false);
  locationCallback.current = onLocation;
  errorCallback.current = onError;
  if (!queue.current)
    queue.current = new BrowserInputQueue(async (payload) => {
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(25000),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            data.error || `Browser action failed (HTTP ${response.status}).`,
          );
        }
      } catch (error) {
        if (alive.current && session.current === payload.sessionId) {
          const message =
            error instanceof Error
              ? error.message
              : "Could not send input to the webpage.";
          setInputNotice(message);
          errorCallback.current?.(message);
        }
      }
    });
  const send = useCallback(
    (action: string, extra: Record<string, unknown> = {}) => {
      if (!session.current) return;
      try {
        queue.current?.enqueue({
          action,
          sessionId: session.current,
          ...extra,
        });
      } catch (error) {
        setInputNotice(
          error instanceof Error ? error.message : "The webpage is busy.",
        );
      }
    },
    [],
  );
  useImperativeHandle(
    ref,
    () => ({
      action: (action) => send(action),
      navigate: (next) => {
        if (!session.current) {
          if (error) {
            lastURL.current = next;
            setRetry((value) => value + 1);
          }
          return;
        }
        lastURL.current = next;
        send("navigate", { url: next });
      },
      screenshot: async () => {
        if (!session.current) throw new Error("The browser is not ready.");
        const response = await fetch(
          ENDPOINT + "?sessionId=" + encodeURIComponent(session.current),
          { cache: "no-store" },
        );
        if (!response.ok)
          throw new Error("Could not save the browser screenshot.");
        return response.blob();
      },
    }),
    [send, error],
  );
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    setReady(false);
    setError("");
    setInputNotice("");
    setStatus("Starting an isolated browser…");
    const rect = surface.current?.getBoundingClientRect();
    dimensions.current = {
      width: Math.min(1920, Math.max(320, Math.round(rect?.width || 1024))),
      height: Math.min(1200, Math.max(240, Math.round(rect?.height || 768))),
    };
    void startSession(
      {
        url: lastURL.current,
        ...dimensions.current,
      },
      () => cancelled,
    )
      .then((data) => {
        if (!data) return;
        if (cancelled) {
          void fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "close",
              sessionId: data.sessionId,
            }),
            keepalive: true,
          }).catch(() => {});
          return;
        }
        session.current = data.sessionId;
        setReady(true);
        setStatus("");
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      alive.current = false;
      const id = session.current;
      session.current = null;
      queue.current?.clear();
      if (id)
        void fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "close", sessionId: id }),
          keepalive: true,
        }).catch(() => {});
    };
  }, [retry]);
  useEffect(() => {
    if (ready && url !== lastURL.current) {
      lastURL.current = url;
      send("navigate", { url });
    }
  }, [url, ready, send]);
  useEffect(() => {
    if (!ready || !active) return;
    let cancelled = false,
      timer = 0,
      failures = 0;
    const controller = new AbortController();
    const poll = async () => {
      let delay = 350;
      try {
        if (document.hidden) {
          delay = 1500;
          return;
        }
        const response = await fetch(
          ENDPOINT + "?sessionId=" + encodeURIComponent(session.current!),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          if ([401, 403, 404, 410].includes(response.status)) {
            if (!cancelled) {
              session.current = null;
              queue.current?.clear();
              setReady(false);
              setError(
                data.error ||
                  "This browser session ended. Reconnect to continue.",
              );
            }
            return;
          }
          throw new Error(
            data.error ||
              `Could not receive the webpage (HTTP ${response.status}).`,
          );
        }
        if (!response.headers.get("Content-Type")?.startsWith("image/"))
          throw new Error(
            "The browser returned an invalid frame. Try reconnecting.",
          );
        const blob = await response.blob();
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        setImage(next);
        setError("");
        failures = 0;
        const nextURL = response.headers.get("X-Browser-URL"),
          title = response.headers.get("X-Browser-Title");
        if (nextURL) {
          try {
            lastURL.current = decodeURIComponent(nextURL);
            setFrameMetadata({
              url: lastURL.current,
              loading: response.headers.get("X-Browser-Loading") !== "false",
            });
            locationCallback.current(
              lastURL.current,
              title ? decodeURIComponent(title) : "",
            );
          } catch {}
        }
      } catch (e) {
        failures++;
        delay = Math.min(10000, 500 * 2 ** Math.min(failures, 5));
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not receive the browser frame.",
          );
        }
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, delay);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [ready, active, retry]);
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image);
    },
    [image],
  );
  useEffect(() => {
    if (!ready || !surface.current) return;
    let timer = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width < 1 || entry.contentRect.height < 1) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const width = Math.min(
            1920,
            Math.max(320, Math.round(entry.contentRect.width)),
          ),
          height = Math.min(
            1200,
            Math.max(240, Math.round(entry.contentRect.height)),
          );
        if (
          width === dimensions.current.width &&
          height === dimensions.current.height
        )
          return;
        dimensions.current = { width, height };
        send("resize", { width, height });
      }, 160);
    });
    observer.observe(surface.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ready, send]);
  const coordinates = (x: number, y: number) => {
    const rect = surface.current!.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.round(((x - rect.left) * dimensions.current.width) / rect.width),
      ),
      y: Math.max(
        0,
        Math.round(((y - rect.top) * dimensions.current.height) / rect.height),
      ),
    };
  };
  const text = (value: string) => {
    if (value) send("type", { text: value });
  };
  const focusKeyboard = () => keyboard.current?.focus({ preventScroll: true });
  return (
    <div
      className="remote-browser"
      ref={surface}
      tabIndex={-1}
      aria-label="Remote browser viewport"
      aria-description="A streamed webpage. Select Document mode for readable page text and screen reader access."
      onPointerDown={(e) => {
        if (!ready || e.button > 2) return;
        if ((e.target as HTMLElement).closest("button")) return;
        e.preventDefault();
        if (e.pointerType !== "touch") focusKeyboard();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (e.pointerType === "touch") {
          touchGesture.current = {
            x: e.clientX,
            y: e.clientY,
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
          };
          return;
        }
        send("pointer", {
          phase: "down",
          button: e.button === 2 ? "right" : e.button === 1 ? "middle" : "left",
          ...coordinates(e.clientX, e.clientY),
        });
      }}
      onPointerMove={(e) => {
        if (Date.now() - lastMove.current < 40) return;
        lastMove.current = Date.now();
        const gesture = touchGesture.current;
        if (e.pointerType === "touch") {
          if (!gesture || pointer.current !== e.pointerId) return;
          if (
            Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) >
            8
          )
            gesture.moved = true;
          if (gesture.moved)
            send("scroll", {
              deltaX: gesture.x - e.clientX,
              deltaY: gesture.y - e.clientY,
              ...coordinates(e.clientX, e.clientY),
            });
          gesture.x = e.clientX;
          gesture.y = e.clientY;
          return;
        }
        send("pointer", {
          phase: "move",
          ...coordinates(e.clientX, e.clientY),
        });
      }}
      onPointerUp={(e) => {
        if (pointer.current !== e.pointerId) return;
        if (touchGesture.current) {
          if (!touchGesture.current.moved)
            send("click", {
              button: "left",
              ...coordinates(e.clientX, e.clientY),
            });
          touchGesture.current = null;
          pointer.current = null;
          return;
        }
        send("pointer", {
          phase: "up",
          button: e.button === 2 ? "right" : e.button === 1 ? "middle" : "left",
          ...coordinates(e.clientX, e.clientY),
        });
        pointer.current = null;
      }}
      onPointerCancel={() => {
        if (pointer.current !== null && !touchGesture.current)
          send("pointer", { phase: "up", button: "left" });
        touchGesture.current = null;
        pointer.current = null;
      }}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={(e) => {
        if (!ready) return;
        send("scroll", {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          ...coordinates(e.clientX, e.clientY),
        });
      }}
    >
      {image && (
        <img
          src={image}
          data-page-url={frameMetadata.url}
          data-page-loading={String(frameMetadata.loading)}
          alt="Live webpage rendered by Chromium"
          draggable={false}
        />
      )}
      <textarea
        ref={keyboard}
        className="remote-browser-keyboard"
        aria-label="Type into remote webpage"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onPaste={(event) => {
          event.preventDefault();
          text(event.clipboardData.getData("text/plain"));
        }}
        onCompositionStart={() => {
          composition.current = true;
        }}
        onCompositionEnd={(e) => {
          composition.current = false;
          text(e.currentTarget.value);
          e.currentTarget.value = "";
        }}
        onChange={(e) => {
          if (!composition.current) {
            text(e.target.value);
            e.target.value = "";
          }
        }}
        onKeyDown={(e) => {
          if (composition.current || e.nativeEvent.isComposing) return;
          if (
            (e.metaKey && e.code === "KeyK") ||
            (e.ctrlKey && e.code === "Period") ||
            e.altKey ||
            (e.ctrlKey && e.shiftKey)
          )
            return;
          const special = e.key.length !== 1;
          if (!special && !e.metaKey && !e.ctrlKey) return;
          if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") return;
          if (
            (e.metaKey || e.ctrlKey) &&
            ["c", "x"].includes(e.key.toLowerCase())
          ) {
            e.preventDefault();
            setInputNotice(
              "Select Document mode to copy webpage text. Paste into this page with your usual paste shortcut.",
            );
            return;
          }
          e.preventDefault();
          send("key", {
            key: e.key,
            modifiers: [
              ...(e.shiftKey ? ["Shift"] : []),
              ...(e.ctrlKey ? ["Control"] : []),
              ...(e.metaKey ? ["Meta"] : []),
            ],
          });
        }}
      />
      {!image && !error && (
        <div className="remote-browser-state">
          <Globe size={24} />
          <p>{status || "Rendering page…"}</p>
        </div>
      )}
      {(error || inputNotice) && (
        <div className="remote-browser-failure" role="alert">
          <span>{error || inputNotice}</span>
          {onReadDocument && (
            <button onClick={onReadDocument}>
              <BookOpen size={12} />
              Read document
            </button>
          )}
          {error ? (
            <button
              onClick={() => {
                setImage("");
                setRetry((n) => n + 1);
              }}
            >
              <RotateCw size={12} />
              Reconnect
            </button>
          ) : (
            <button
              aria-label="Dismiss browser hint"
              onClick={() => setInputNotice("")}
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
      {ready && (
        <button
          className="remote-browser-touch-keyboard"
          aria-label="Show webpage keyboard"
          title="Type into page"
          onClick={focusKeyboard}
        >
          <Keyboard size={16} />
        </button>
      )}
    </div>
  );
});
