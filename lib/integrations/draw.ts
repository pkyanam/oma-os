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
  const elementTypes = new Set([
    "rectangle",
    "diamond",
    "ellipse",
    "arrow",
    "line",
    "freedraw",
    "text",
    "image",
    "frame",
    "magicframe",
    "embeddable",
    "iframe",
    "selection",
  ]);
  for (const element of value.elements) {
    if (
      !element ||
      typeof element !== "object" ||
      Array.isArray(element) ||
      typeof element.id !== "string" ||
      !element.id ||
      !elementTypes.has(element.type)
    )
      throw new Error(
        "Drawing contains an invalid object. The existing drawing is preserved.",
      );
    for (const field of [
      "x",
      "y",
      "width",
      "height",
      "angle",
      "strokeWidth",
      "opacity",
    ]) {
      if (
        element[field] !== undefined &&
        (typeof element[field] !== "number" || !Number.isFinite(element[field]))
      )
        throw new Error("Drawing contains invalid object geometry.");
    }
    if (
      element.points !== undefined &&
      (!Array.isArray(element.points) ||
        element.points.some(
          (point: unknown) =>
            !Array.isArray(point) ||
            point.length < 2 ||
            point
              .slice(0, 2)
              .some(
                (n: unknown) => typeof n !== "number" || !Number.isFinite(n),
              ),
        ))
    )
      throw new Error("Drawing contains invalid stroke points.");
    if (element.type === "text" && typeof element.text !== "string")
      throw new Error("Drawing contains invalid text.");
  }
  for (const [id, file] of Object.entries(value.files || {})) {
    if (!file || typeof file !== "object" || Array.isArray(file))
      throw new Error("Drawing contains invalid image data.");
    const image = file as Record<string, unknown>;
    if (
      image.id !== id ||
      typeof image.dataURL !== "string" ||
      !/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml|avif)(?:;[^,]*)?,/i.test(
        image.dataURL,
      )
    )
      throw new Error(
        "Drawing images must contain embedded image data, not remote URLs.",
      );
  }
  if (
    value.appState !== undefined &&
    (value.appState === null ||
      typeof value.appState !== "object" ||
      Array.isArray(value.appState))
  )
    throw new Error("Drawing contains invalid canvas settings.");
  const appState = { ...value.appState };
  delete appState.collaborators;
  return {
    ...value,
    appState: { ...appState, theme: "dark" },
  };
}
