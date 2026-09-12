export type OfflineStatus = {
  supported: boolean;
  enabled: boolean;
  ready: boolean;
  updateWaiting: boolean;
  phase: "idle" | "downloading" | "ready" | "error";
  progress?: { completed: number; total: number };
  error?: string;
};
let progress: OfflineStatus["progress"],
  phase: OfflineStatus["phase"] = "idle",
  error: string | undefined;
const supported = () =>
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  !!document.querySelector('meta[name="oma-offline"][content="available"]');
const ours = (registration: ServiceWorkerRegistration) =>
  [registration.active, registration.waiting, registration.installing].some(
    (worker) => worker && new URL(worker.scriptURL).pathname === "/oma-sw.js",
  );
async function registration() {
  const item = await navigator.serviceWorker.getRegistration("/");
  return item && ours(item) ? item : undefined;
}
async function workerReady(worker: ServiceWorker) {
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(false);
    }, 2000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data?.ready === true);
    };
    worker.postMessage({ type: "oma-offline-status" }, [channel.port2]);
  });
}
export async function getOfflineStatus(): Promise<OfflineStatus> {
  if (!supported())
    return {
      supported: false,
      enabled: false,
      ready: false,
      updateWaiting: false,
      phase: "idle",
    };
  const item = await registration(),
    ready = item?.active ? await workerReady(item.active) : false;
  return {
    supported: true,
    enabled: !!item,
    ready,
    updateWaiting: !!item?.waiting,
    phase: phase === "idle" && ready ? "ready" : phase,
    progress,
    error,
  };
}
export async function enableOffline() {
  if (!supported())
    throw new Error(
      "Offline installation is available on the published Cloudflare desktop.",
    );
  await (
    await caches.open("oma-offline-control")
  ).delete("/__oma_offline_disabled");
  phase = "downloading";
  error = undefined;
  progress = { completed: 0, total: 0 };
  const listener = (event: MessageEvent) => {
    if (event.data?.type === "oma-offline") {
      phase = event.data.phase;
      progress = event.data.progress;
      error = event.data.error;
    }
  };
  navigator.serviceWorker.addEventListener("message", listener);
  try {
    const item = await navigator.serviceWorker.register("/oma-sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    await item.update();
    await new Promise<void>((resolve, reject) => {
      const check = () => {
        if (!item.installing && (item.active || item.waiting)) {
          cleanup();
          resolve();
        } else if (
          phase === "error" ||
          item.installing?.state === "redundant"
        ) {
          cleanup();
          reject(new Error(error || "Offline download failed. Please retry."));
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Offline download timed out. Please retry online."));
      }, 120_000);
      const poll = setInterval(check, 150);
      const cleanup = () => {
        clearTimeout(timer);
        clearInterval(poll);
      };
      check();
    });
    const paths = performance
      .getEntriesByType("resource")
      .map((entry) => new URL(entry.name, location.href))
      .filter((url) => url.origin === location.origin && !url.search)
      .map((url) => url.pathname);
    (item.active || item.waiting)?.postMessage({
      type: "oma-offline-seed",
      paths,
    });
    if (!(await workerReady(item.waiting || item.active!)))
      throw new Error(
        "Offline files are incomplete. Close all oma.os tabs, reopen online and retry.",
      );
    phase = "ready";
  } catch (cause) {
    phase = "error";
    error = cause instanceof Error ? cause.message : "Offline download failed.";
    throw new Error(error);
  } finally {
    navigator.serviceWorker.removeEventListener("message", listener);
  }
}
export async function disableOffline() {
  if (!supported()) return;
  const item = await registration();
  await (
    await caches.open("oma-offline-control")
  ).put("/__oma_offline_disabled", new Response("disabled"));
  const worker = item?.active;
  if (worker)
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        channel.port1.close();
        resolve();
      }, 2000);
      channel.port1.onmessage = () => {
        clearTimeout(timer);
        channel.port1.close();
        resolve();
      };
      worker.postMessage({ type: "oma-offline-disable" }, [channel.port2]);
    });
  await item?.unregister();
  for (const key of await caches.keys())
    if (key.startsWith("oma-offline-") && key !== "oma-offline-control")
      await caches.delete(key);
  phase = "idle";
  progress = undefined;
  error = undefined;
}
