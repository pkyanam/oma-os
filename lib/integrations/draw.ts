import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
export type Drawing = ExcalidrawInitialDataState & {
  type: "excalidraw";
  version: number;
  source: string;
};
export function newDrawing(): Drawing {
  return {
    type: "excalidraw",
    version: 2,
    source: "oma.os",
    elements: [],
    files: {},
    appState: {
      // Excalidraw inverts scene colors for dark mode; this renders near Tokyo Night.
      viewBackgroundColor: "#f2f3ff",
      currentItemStrokeColor: "#1e1e1e",
      theme: "dark",
    },
  };
}
export function parseDrawing(raw: string): Drawing {
  if (raw.length > 25_000_000)
    throw new Error(
      "Drawing limit is 25 MB. Keep a separate copy of large source images.",
    );
  const value = JSON.parse(raw);
  if (
    !value ||
    value.type !== "excalidraw" ||
    !Array.isArray(value.elements) ||
    value.elements.length > 20000
  )
    throw new Error(
      "Choose a valid .excalidraw scene with fewer than 20,000 objects.",
    );
  if (
    value.files &&
    (typeof value.files !== "object" || Array.isArray(value.files))
  )
    throw new Error("Invalid drawing image data.");
  const appState = { ...value.appState };
  delete appState.collaborators;
  return {
    ...value,
    appState: { ...appState, theme: "dark" },
  };
}
