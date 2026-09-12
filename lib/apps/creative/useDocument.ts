"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fs, errorMessage } from "@/lib/fs/opfs";
import { useDesktop } from "@/lib/state/store";

/** Debounced single-writer queue, with optimistic disk conflict detection. */
export function useDocument<T>(
  id: string,
  path: string,
  create: () => T,
  parse: (raw: string) => T,
) {
  const version = useDesktop((s) => s.fsVersion);
  const [value, setValue] = useState<T>(create);
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState("Loading…"),
    [error, setError] = useState("");
  const latest = useRef(value),
    disk = useRef<string | undefined>(undefined),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    pending = useRef(false),
    queue = useRef(Promise.resolve()),
    alive = useRef(true);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (!pending.current) return;
        const body = JSON.stringify(latest.current, null, 2);
        if (alive.current) setStatus("Saving…");
        try {
          await fs.write(path, body, disk.current);
          disk.current = body;
          if (body === JSON.stringify(latest.current, null, 2)) {
            pending.current = false;
            useDesktop.getState().setDirty(id, false);
            if (alive.current) {
              setStatus("Saved locally");
              setError("");
            }
          }
          useDesktop.getState().refreshFs();
        } catch (e) {
          if (alive.current) {
            setStatus("Unsaved");
            setError(errorMessage(e));
          }
        }
      });
    return queue.current;
  }, [id, path]);
  const reload = useCallback(async () => {
    clearTimeout(timer.current);
    pending.current = false;
    try {
      await queue.current;
      const raw = await fs.read(path);
      const next = parse(raw);
      latest.current = next;
      disk.current = raw;
      pending.current = false;
      setValue(next);
      setError("");
      setStatus("Saved locally");
      setReady(true);
      useDesktop.getState().setDirty(id, false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, path, parse]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    (async () => {
      try {
        await fs.mkdir(path.slice(0, path.lastIndexOf("/")));
        let next: T;
        if (await fs.exists(path)) {
          const raw = await fs.read(path);
          next = parse(raw);
          disk.current = raw;
        } else {
          next = create();
          await fs.touch(path);
          disk.current = "";
        }
        if (cancelled) return;
        latest.current = next;
        setValue(next);
        setReady(true);
        setStatus("Saved locally");
        if (disk.current === "") {
          pending.current = true;
          await flush();
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
          setStatus("Unavailable");
        }
      }
    })();
    return () => {
      cancelled = true;
      alive.current = false;
      void flush();
    };
  }, [path, create, parse, flush]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
      }
    };
    const hide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [flush]);
  useEffect(() => {
    if (!ready || pending.current) return;
    let cancelled = false;
    fs.read(path)
      .then((raw) => {
        if (cancelled || pending.current || raw === disk.current) return;
        const next = parse(raw);
        disk.current = raw;
        latest.current = next;
        setValue(next);
        setError("");
        setStatus("Saved locally");
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [version, ready, path, parse]);
  const update = useCallback(
    (next: T | ((old: T) => T)) => {
      if (!ready) return;
      latest.current =
        typeof next === "function"
          ? (next as (old: T) => T)(latest.current)
          : next;
      setValue(latest.current);
      pending.current = true;
      setStatus("Unsaved");
      useDesktop.getState().setDirty(id, true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 400);
    },
    [ready, id, flush],
  );
  return { value, update, ready, status, error, flush, reload };
}
