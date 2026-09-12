"use client";
import { useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  restore,
  MainMenu,
  serializeAsJSON,
  exportToBlob,
  exportToSvg,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Download, Upload, Save, Boxes, Plus } from "lucide-react";
import { newDrawing, parseDrawing } from "@/lib/integrations/draw";
import { useDocument } from "@/lib/apps/creative/useDocument";
import { fs } from "@/lib/fs/opfs";
import { useDesktop } from "@/lib/state/store";
import "@excalidraw/excalidraw/index.css";
import "./integrations.css";
if (typeof window !== "undefined")
  (
    window as Window & { EXCALIDRAW_ASSET_PATH?: string }
  ).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Draw({
  id,
  active,
  path = "/home/guest/Documents/Sketch.excalidraw",
}: {
  id: string;
  active: boolean;
  path?: string;
}) {
  const doc = useDocument(id, path, newDrawing, parseDrawing),
    api = useRef<ExcalidrawImperativeAPI | null>(null),
    previous = useRef(""),
    upload = useRef<HTMLInputElement>(null),
    importRevision = useRef(0);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      importRevision.current++;
    },
    [],
  );
  useEffect(() => {
    const raw = JSON.stringify(doc.value);
    if (api.current && raw !== previous.current) {
      previous.current = raw;
      const restored = restore(
        doc.value,
        api.current.getAppState(),
        api.current.getSceneElements(),
      );
      api.current.updateScene({
        elements: restored.elements,
        appState: { ...api.current.getAppState(), ...restored.appState },
      });
      if (doc.value.files) api.current.addFiles(Object.values(doc.value.files));
    }
  }, [doc.value]);
  async function exportScene(kind: "json" | "svg" | "png") {
    try {
      if (!api.current) return;
      const elements = api.current.getSceneElements(),
        appState = api.current.getAppState(),
        files = api.current.getFiles(),
        name = path
          .split("/")
          .pop()!
          .replace(/\.excalidraw$/, "");
      if (kind === "json")
        download(
          new Blob([serializeAsJSON(elements, appState, files, "local")], {
            type: "application/json",
          }),
          name + ".excalidraw",
        );
      else if (kind === "svg") {
        const svg = await exportToSvg({
          elements,
          appState: { ...appState, exportWithDarkMode: true },
          files,
        });
        download(
          new Blob([svg.outerHTML], { type: "image/svg+xml" }),
          name + ".svg",
        );
      } else
        download(
          await exportToBlob({
            elements,
            appState: { ...appState, exportWithDarkMode: true },
            files,
            mimeType: "image/png",
          }),
          name + ".png",
        );
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div
      className="native-integration draw-integration"
      onKeyDown={(e) => {
        if (active && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          e.stopPropagation();
          void doc.flush();
        }
      }}
    >
      <header className="integration-toolbar">
        <strong>Excalidraw</strong>
        <span className="integration-path" title={path}>
          {path.split("/").pop()}
        </span>
        <button
          disabled={!doc.ready}
          onClick={() =>
            void (async () => {
              try {
                const nextPath = `/home/guest/Documents/Sketch-${Date.now()}.excalidraw`;
                await fs.writeBlob(
                  nextPath,
                  new Blob([JSON.stringify(newDrawing(), null, 2)]),
                  { overwrite: false },
                );
                useDesktop.getState().refreshFs();
                useDesktop.getState().launch("draw", nextPath);
              } catch (e) {
                setError(String(e));
              }
            })()
          }
        >
          <Plus size={14} />
          New
        </button>
        <button
          onClick={() => void doc.flush()}
          disabled={!doc.ready}
          title="Save drawing"
        >
          <Save size={14} />
          Save
        </button>
        <button onClick={() => upload.current?.click()} disabled={!doc.ready}>
          <Upload size={14} />
          Import
        </button>
        <button onClick={() => void exportScene("json")} disabled={!doc.ready}>
          <Download size={14} />
          .excalidraw
        </button>
        <button onClick={() => void exportScene("svg")} disabled={!doc.ready}>
          SVG
        </button>
        <button onClick={() => void exportScene("png")} disabled={!doc.ready}>
          PNG
        </button>
      </header>
      <input
        ref={upload}
        type="file"
        accept=".excalidraw,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const revision = ++importRevision.current;
          try {
            if (file.size > 25_000_000)
              throw new Error("Drawing limit is 25 MB.");
            const next = parseDrawing(await file.text());
            if (revision !== importRevision.current) return;
            // Validate through the upstream normalizer before replacing the saved scene.
            const normalized = restore(
              next,
              api.current?.getAppState(),
              api.current?.getSceneElements(),
            );
            doc.update({
              ...next,
              elements: normalized.elements,
              appState: normalized.appState,
              files: normalized.files,
            });
            setError("");
          } catch (err) {
            setError(String(err));
          }
        }}
      />
      <div className="draw-surface">
        {doc.ready ? (
          <Excalidraw
            excalidrawAPI={(value) => {
              api.current = value;
            }}
            initialData={doc.value}
            theme="dark"
            name={path.split("/").pop()}
            autoFocus={false}
            handleKeyboardGlobally={false}
            aiEnabled={false}
            validateEmbeddable={false}
            onLinkOpen={(element, event) => {
              event.preventDefault();
              if (element.link && /^https?:\/\//i.test(element.link))
                useDesktop.getState().launch("browser", element.link);
            }}
            onChange={(elements, appState, files) => {
              try {
                const next = parseDrawing(
                    serializeAsJSON(elements, appState, files, "local"),
                  ),
                  raw = JSON.stringify(next);
                if (raw !== previous.current) {
                  previous.current = raw;
                  doc.update(next);
                }
              } catch (err) {
                setError(String(err));
              }
            }}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: false,
                toggleTheme: false,
              },
            }}
          >
            <MainMenu>
              <MainMenu.Item
                icon={<Boxes size={16} />}
                onSelect={() => {
                  if (!api.current) return;
                  const x = 100,
                    y = 100;
                  api.current.updateScene({
                    elements: [
                      ...api.current.getSceneElements(),
                      ...convertToExcalidrawElements([
                        {
                          type: "rectangle",
                          x,
                          y,
                          width: 240,
                          height: 100,
                          strokeColor: "#7aa2f7",
                          label: { text: "An idea", strokeColor: "#c0caf5" },
                        },
                        {
                          type: "arrow",
                          x: x + 265,
                          y: y + 50,
                          width: 110,
                          height: 0,
                          strokeColor: "#7dcfff",
                        },
                        {
                          type: "rectangle",
                          x: x + 400,
                          y,
                          width: 240,
                          height: 100,
                          strokeColor: "#9ece6a",
                          label: {
                            text: "A working system",
                            strokeColor: "#c0caf5",
                          },
                        },
                      ]),
                    ],
                  });
                }}
              >
                Insert architecture sketch
              </MainMenu.Item>
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.Help />
              <MainMenu.DefaultItems.ClearCanvas />
            </MainMenu>
          </Excalidraw>
        ) : (
          <div className="integration-empty">Loading your drawing…</div>
        )}
      </div>
      {(doc.error || error) && (
        <div className="integration-error" role="alert">
          {doc.error || error}
          {doc.error && (
            <button onClick={() => void doc.reload()}>
              Reload disk version
            </button>
          )}
        </div>
      )}
      <footer className="integration-status">
        <span>{doc.status}</span>
        <span>Excalidraw · drawings and images stay in this browser</span>
      </footer>
    </div>
  );
}
