"use client";
import { useEffect, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize,
  Music,
  Upload,
} from "lucide-react";
import { fs, errorMessage } from "@/lib/fs/opfs";
import { useDesktop } from "@/lib/state/store";
import { fileKind, formatBytes, mimeType } from "@/lib/files/kinds";
import { downloadBlob, importFiles } from "@/lib/files/operations";
import "./styles/files-media.css";
export default function Media({ path }: { path?: string; active?: boolean }) {
  const [current, setCurrent] = useState(path || ""),
    [url, setURL] = useState(""),
    [blob, setBlob] = useState<Blob | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0),
    [fit, setFit] = useState(true),
    [dimensions, setDimensions] = useState("");
  const input = useRef<HTMLInputElement>(null),
    version = useDesktop((s) => s.fsVersion),
    kind = fileKind(current);
  useEffect(() => {
    setCurrent(path || "");
  }, [path]);
  useEffect(() => {
    if (!current) return;
    let live = true,
      objectURL = "";
    setURL("");
    setBlob(null);
    setError("");
    setLoading(true);
    setZoom(1);
    setRotation(0);
    setFit(true);
    setDimensions("");
    fs.readBlob(current)
      .then((data) => {
        if (!live) return;
        const typed = new Blob([data], { type: mimeType(current) });
        objectURL = URL.createObjectURL(typed);
        setBlob(typed);
        setURL(objectURL);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [current, version]);
  const importMedia = async (files: File[]) => {
    try {
      await fs.mkdir("/home/guest/Media");
      const imported = await importFiles("/home/guest/Media", files);
      useDesktop.getState().refreshFs();
      if (imported[0]) setCurrent(imported[0]);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className="media-app">
      <div className="media-toolbar">
        <span className="media-title" title={current}>
          {current.split("/").pop() || "Media"}
        </span>
        <button
          title="Import media"
          aria-label="Import media"
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
        </button>
        <button
          title="Open Files"
          aria-label="Open Files"
          onClick={() => useDesktop.getState().launch("files")}
        >
          <FolderOpen size={15} />
        </button>
        {blob && (
          <button
            title="Download file"
            aria-label="Download file"
            onClick={() =>
              downloadBlob(blob, current.split("/").pop() || "download")
            }
          >
            <Download size={15} />
          </button>
        )}
        {kind === "image" && url && (
          <>
            <button
              title="Zoom out"
              aria-label="Zoom out"
              onClick={() => {
                setFit(false);
                setZoom((z) => Math.max(0.1, z - 0.25));
              }}
            >
              <ZoomOut size={15} />
            </button>
            <button
              title="Zoom in"
              aria-label="Zoom in"
              onClick={() => {
                setFit(false);
                setZoom((z) => Math.min(5, z + 0.25));
              }}
            >
              <ZoomIn size={15} />
            </button>
            <button
              title="Fit image"
              aria-label="Fit image"
              onClick={() => {
                setFit(true);
                setZoom(1);
                setRotation(0);
              }}
            >
              <Maximize size={15} />
            </button>
            <button
              title="Rotate image"
              aria-label="Rotate image"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              <RotateCw size={15} />
            </button>
          </>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/*,audio/*,video/*,application/pdf"
        onChange={(e) => {
          void importMedia(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <div className="media-stage">
        {error ? (
          <div className="media-empty" role="alert">
            {error}
          </div>
        ) : loading ? (
          <div className="media-empty">Loading media…</div>
        ) : !current ? (
          <div className="media-empty">
            <Music size={36} />
            <h2>Your media, on your desktop.</h2>
            <p>
              View images, listen to audio, and play video stored in oma.os.
              Import files from your device to begin.
            </p>
            <button onClick={() => input.current?.click()}>Import media</button>
          </div>
        ) : url && kind === "image" ? (
          <div className={`media-image-scroll ${fit ? "is-fit" : ""}`}>
            <img
              alt={current.split("/").pop()}
              src={url}
              draggable={false}
              style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }}
              onLoad={(e) =>
                setDimensions(
                  `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`,
                )
              }
              onError={() =>
                setError(
                  "This image format could not be decoded by your browser.",
                )
              }
            />
          </div>
        ) : url && kind === "audio" ? (
          <div className="media-audio">
            <Music size={58} />
            <h2>{current.split("/").pop()}</h2>
            <audio
              controls
              src={url}
              preload="metadata"
              onError={() =>
                setError("This audio format is not supported by your browser.")
              }
            />
            <p>
              Playback stays local. Use your device’s media controls to pause.
            </p>
          </div>
        ) : url && kind === "video" ? (
          <video
            className="media-video"
            controls
            playsInline
            preload="metadata"
            src={url}
            onError={() =>
              setError("This video codec is not supported by your browser.")
            }
          />
        ) : url && kind === "pdf" ? (
          <iframe
            className="media-pdf"
            title={`PDF: ${current.split("/").pop()}`}
            src={url}
          />
        ) : (
          <div className="media-empty">
            <p>No preview is available for this file type.</p>
            <button
              disabled={!blob}
              onClick={() =>
                blob &&
                downloadBlob(blob, current.split("/").pop() || "download")
              }
            >
              Download file
            </button>
          </div>
        )}
      </div>
      <div className="client-footer">
        <span>
          {blob ? formatBytes(blob.size) : "Local media"}
          {dimensions ? ` · ${dimensions}` : ""}
        </span>
        <span>
          {kind === "image" && url
            ? fit
              ? "Fit"
              : "Zoom " + Math.round(zoom * 100) + "%"
            : "Stored in this browser"}
        </span>
      </div>
    </div>
  );
}
