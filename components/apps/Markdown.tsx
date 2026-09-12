"use client";
import {
  createContext,
  useContext,
  useState,
  isValidElement,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDesktop } from "@/lib/state/store";
import { appForPath } from "@/lib/files/kinds";
import "./Markdown.css";
const TaskLine = createContext<number | undefined>(undefined);
function destination(href: string) {
  if (/^\/(home\/guest|\.oma)(\/|$)/.test(href))
    return { type: "file" as const, value: href };
  try {
    const url = new URL(href);
    if (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return { type: "web" as const, value: url.href };
  } catch {}
  return null;
}
function open(href: string) {
  const target = destination(href);
  if (!target) return;
  const state = useDesktop.getState();
  if (target.type === "web") state.launch("browser", target.value);
  else state.launch(appForPath(target.value), target.value);
}
function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node))
    return textContent(node.props.children);
  return "";
}
function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  return (
    <div className="oma-md-code">
      <button
        aria-label="Copy code"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(textContent(children));
            setCopied(true);
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      >
        {failed ? "Select to copy" : copied ? "Copied" : "Copy"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}
function Checkbox({
  checked,
  onToggle,
}: {
  checked?: boolean;
  onToggle?: (line: number) => void;
}) {
  const line = useContext(TaskLine);
  return (
    <input
      type="checkbox"
      checked={!!checked}
      disabled={!onToggle || line === undefined}
      aria-label={checked ? "Completed task" : "Incomplete task"}
      onChange={() => {
        if (line !== undefined) onToggle?.(line);
      }}
    />
  );
}
/** Safe GFM. Task callback receives a one-based source line. Raw HTML and automatic image requests are disabled. */
export default function Markdown({
  children,
  onTaskToggle,
  className = "",
}: {
  children: string;
  onTaskToggle?: (line: number) => void;
  className?: string;
}) {
  return (
    <div className={"oma-markdown " + className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) =>
            href && destination(href) ? (
              <button
                className="oma-md-link"
                title={href}
                onClick={() => open(href)}
              >
                {children}
              </button>
            ) : (
              <span>{children}</span>
            ),
          img: ({ src, alt }) =>
            typeof src === "string" && destination(src) ? (
              <button className="oma-md-image" onClick={() => open(src)}>
                Image: {alt || src}
              </button>
            ) : (
              <span>[Image: {alt || "unavailable"}]</span>
            ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ children, className }) => {
            const value = textContent(children);
            return !className &&
              !value.includes("\n") &&
              /^\/(home\/guest|\.oma)\//.test(value) &&
              destination(value) ? (
              <button
                className="oma-md-file"
                title="Open file"
                onClick={() => open(value)}
              >
                <code>{children}</code>
              </button>
            ) : (
              <code className={className}>{children}</code>
            );
          },
          li: ({ children, node, ...props }) => (
            <TaskLine.Provider value={node?.position?.start.line}>
              <li {...props}>{children}</li>
            </TaskLine.Provider>
          ),
          input: ({ checked }) => (
            <Checkbox checked={checked} onToggle={onTaskToggle} />
          ),
          table: ({ children }) => (
            <div className="oma-md-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
