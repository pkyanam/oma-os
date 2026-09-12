"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fs } from "@/lib/fs/opfs";
import { useDesktop } from "@/lib/state/store";
import {
  DocumentSession,
  type DocumentSnapshot,
  type DocumentIO,
} from "./document-session";
const io: DocumentIO = {
  ensureParent: (path) => fs.mkdir(path.slice(0, path.lastIndexOf("/"))),
  exists: (path) => fs.exists(path),
  // Readers coordinate with OPFS writers so they cannot observe a newly created empty handle.
  read: async (path) =>
    navigator.locks
      ? navigator.locks.request("oma-file:" + fs.normalize(path), () =>
          fs.read(path),
        )
      : fs.read(path),
  create: (path, body, guard) =>
    fs.writeBlob(path, new Blob([body], { type: "application/json" }), {
      overwrite: false,
      guard,
    }),
  write: (path, body, expected) => fs.write(path, body, expected),
  changed: () => useDesktop.getState().refreshFs(),
};
/** Session-scoped autosave; the controller is independently tested for asynchronous races. */
export function useDocument<T>(
  id: string,
  path: string,
  create: () => T,
  parse: (raw: string) => T,
) {
  const version = useDesktop((s) => s.fsVersion);
  const [snapshot, setSnapshot] = useState<DocumentSnapshot<T>>(() => ({
    value: create(),
    ready: false,
    status: "Loading…",
    error: "",
    dirty: false,
  }));
  const session = useRef<DocumentSession<T> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    return session.current?.flush() ?? Promise.resolve();
  }, []);
  useEffect(() => {
    const current = new DocumentSession(path, create, parse, io, (state) => {
      if (session.current !== current) return;
      setSnapshot(state);
      useDesktop.getState().setDirty(id, state.dirty);
    });
    session.current = current;
    setSnapshot(current.state);
    void current.load();
    return () => {
      clearTimeout(timer.current);
      if (session.current === current) session.current = null;
      void current.dispose();
    };
  }, [id, path, create, parse]);
  useEffect(() => {
    void session.current?.refresh();
  }, [version]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (session.current?.state.dirty) event.preventDefault();
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
  const update = useCallback((next: T | ((old: T) => T)) => {
    const current = session.current;
    if (!current?.state.ready) return;
    current.update(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void current.flush(), 400);
  }, []);
  const reload = useCallback(() => {
    clearTimeout(timer.current);
    return session.current?.reload() ?? Promise.resolve();
  }, []);
  return {
    value: snapshot.value,
    ready: snapshot.ready,
    status: snapshot.status,
    error: snapshot.error,
    update,
    flush,
    reload,
  };
}
