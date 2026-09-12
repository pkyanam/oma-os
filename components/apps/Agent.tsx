"use client";
import { agentErrorText } from "@/lib/agent/errors";
import { modelConnectionIssue } from "@/lib/agent/readiness";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUp,
  TerminalSquare,
  Settings2,
  Square,
  Plus,
  History,
  FileText,
  Paperclip,
  X,
  ChevronLeft,
  Trash2,
  Check,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import type { ModelMessage } from "ai";
import { routeAgent } from "@/lib/agent/router";
import { runAgent } from "@/lib/agent/harness";
import { useAgentConfig } from "@/lib/agent/settings";
import {
  ARCHIVE_PATH,
  newConversation,
  parseConversation,
  replayConversation,
  transcriptMarkdown,
  contextPrompt,
  conversationTitle,
  type Conversation,
  type TranscriptMessage,
  type ContextFile,
} from "@/lib/agent/conversations";
import { saveConversationArchive } from "@/lib/agent/archive";
import { fitConversation } from "@/lib/agent/context-budget";
import { workflows } from "@/lib/agent/workflows";
import { fs } from "@/lib/fs/opfs";
import { useDesktop } from "@/lib/state/store";
import AgentSettings from "./AgentSettings";
import Markdown from "./Markdown";
import "./agent.css";
type Approval = {
  path: string;
  before: string;
  after: string;
  resolve: (yes: boolean) => void;
};
const message = (
  role: TranscriptMessage["role"],
  text: string,
): TranscriptMessage => ({ id: crypto.randomUUID(), role, text });
const errorText = agentErrorText;
export default function Agent({ active }: { active: boolean }) {
  const config = useAgentConfig();
  const [conversation, setConversation] =
    useState<Conversation>(newConversation);
  const [archives, setArchives] = useState<Conversation[]>([]);
  const [ready, setReady] = useState(false),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<
    "chat" | "settings" | "history" | "context"
  >("chat");
  const [approval, setApproval] = useState<Approval | null>(null),
    [context, setContext] = useState<ContextFile[]>([]);
  const [paths, setPaths] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState("");
  const [step, setStep] = useState(0),
    [usage, setUsage] = useState(""),
    [failed, setFailed] = useState(false),
    [deleteId, setDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null),
    transcriptRef = useRef<HTMLDivElement>(null),
    follow = useRef(true);
  const history = useRef<ModelMessage[]>([]),
    abort = useRef<AbortController | null>(null),
    saving = useRef<Promise<void>>(Promise.resolve());
  const deleted = useRef(new Set<string>());
  const archiveBaselines = useRef(new Map<string, string>());
  const current = useRef(conversation),
    running = useRef(false),
    mounted = useRef(true),
    approvalTail = useRef<Promise<unknown>>(Promise.resolve());
  const connectionIssue = modelConnectionIssue(config);
  const connected = connectionIssue === null;
  useEffect(() => {
    setFailed(false);
  }, [config.model, config.mode, config.authenticated, config.apiKey]);
  current.current = conversation;
  const persist = useCallback((value: Conversation) => {
    if (!value.messages.length || deleted.current.has(value.id)) return;
    saving.current = saving.current
      .catch(() => {})
      .then(async () => {
        if (deleted.current.has(value.id)) return;
        const saved = await saveConversationArchive(
          value,
          archiveBaselines.current.get(value.id),
          fs,
        );
        archiveBaselines.current.set(value.id, saved);
      })
      .catch((error) => {
        if (mounted.current)
          setNotice(
            "History not saved: " +
              errorText(error) +
              " Export your transcript to preserve this version.",
          );
      });
  }, []);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void (async () => {
      await fs.mkdir(ARCHIVE_PATH);
      const entries = (await fs.ls(ARCHIVE_PATH)).filter((entry) =>
        entry.name.endsWith(".json"),
      );
      const results = await Promise.allSettled(
        entries.slice(0, 100).map(async (entry) => {
          const raw = await fs.read(entry.path),
            value = parseConversation(raw);
          if (entry.name !== value.id + ".json")
            throw new Error("Archive ID does not match its filename.");
          return { value, raw };
        }),
      );
      const loaded = results
        .flatMap((result) =>
          result.status === "fulfilled" ? [result.value.value] : [],
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);
      if (cancelled) return;
      for (const result of results)
        if (result.status === "fulfilled")
          archiveBaselines.current.set(result.value.value.id, result.value.raw);
      setArchives(loaded);
      if (loaded[0]) {
        setConversation(loaded[0]);
        history.current = replayConversation(loaded[0].messages);
      }
      if (results.some((result) => result.status === "rejected"))
        setNotice(
          "Some conversation archives could not be read. Their files have been preserved.",
        );
    })()
      .catch((error) => {
        if (!cancelled) setNotice("History unavailable: " + errorText(error));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      abort.current?.abort(
        new DOMException("Agent window closed", "AbortError"),
      );
      persist(current.current);
    };
  }, [persist]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => persist(conversation), 500);
    return () => clearTimeout(timer);
  }, [conversation, persist, ready]);
  useEffect(() => {
    if (active && panel === "chat") inputRef.current?.focus();
  }, [active, panel]);
  useEffect(() => {
    if (
      follow.current &&
      transcriptRef.current &&
      (conversation.messages.length > 0 || approval)
    )
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [conversation.messages, approval]);
  useEffect(() => {
    useDesktop.setState({
      agentStatus: busy
        ? "think"
        : failed
          ? "err"
          : connected
            ? "idle"
            : "offline",
    });
  }, [busy, connected, failed]);
  useEffect(() => {
    const controller = new AbortController();
    let superseded = false;
    // A newer login/logout transition makes this initial snapshot stale.
    // The connection hook owns subsequent auth changes.
    const unsubscribe = useAgentConfig.subscribe((current, previous) => {
      if (current.authenticated !== previous.authenticated) {
        superseded = true;
        controller.abort();
      }
    });
    void fetch("/api/chatgpt/session", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((session) => {
        if (session && !superseded && !controller.signal.aborted)
          useAgentConfig.setState({
            authenticated: session.status === "authenticated",
          });
      })
      .catch(() => {});
    return () => {
      unsubscribe();
      controller.abort();
    };
  }, []);
  const updateMessages = (
    update: (messages: TranscriptMessage[]) => TranscriptMessage[],
  ) => {
    if (!mounted.current) return;
    setConversation((value) => {
      const messages = update(value.messages);
      return {
        ...value,
        title: conversationTitle(messages),
        updatedAt: Date.now(),
        messages,
      };
    });
  };
  const append = (role: TranscriptMessage["role"], text: string) =>
    updateMessages((messages) => [...messages, message(role, text)]);
  const chooseConversation = (value: Conversation) => {
    persist(current.current);
    setArchives((values) =>
      [
        ...values.filter((item) => item.id !== current.current.id),
        current.current,
      ]
        .filter((item) => item.messages.length)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    );
    setConversation(value);
    history.current = replayConversation(value.messages);
    setContext([]);
    setPanel("chat");
    setUsage("");
    setNotice("");
    setFailed(false);
    follow.current = true;
  };
  const exportConversation = async () => {
    try {
      const path = `/home/guest/Documents/conversation-${conversation.id.slice(0, 8)}-${Date.now()}.md`;
      await fs.write(path, transcriptMarkdown(conversation));
      useDesktop.getState().refreshFs();
      useDesktop.getState().launch("editor", path);
      setNotice("Transcript saved to " + path);
    } catch (error) {
      setNotice(errorText(error));
    }
  };
  const openContext = async () => {
    setPanel("context");
    setQuery("");
    try {
      setPaths(
        (await fs.search("/home/guest", 300))
          .filter((entry) =>
            /\.(md|txt|json|csv|html?|css|js|jsx|ts|tsx|py|toml|yaml|yml|sql|xml|svg)$/i.test(
              entry.name,
            ),
          )
          .map((entry) => entry.path),
      );
    } catch (error) {
      setNotice(errorText(error));
    }
  };
  const attach = async (path: string) => {
    if (context.some((file) => file.path === path)) {
      setContext((files) => files.filter((file) => file.path !== path));
      return;
    }
    if (context.length >= 4) {
      setNotice("Attach up to four files per message.");
      return;
    }
    try {
      const content = await fs.read(path);
      if (content.includes("\0"))
        throw new Error("This looks like a binary file. Attach a text file.");
      setContext((files) =>
        files.some((file) => file.path === path)
          ? files
          : [
              ...files,
              {
                path,
                content: content.slice(0, 16000),
                characters: content.length,
                truncated: content.length > 16000,
              },
            ].slice(0, 4),
      );
    } catch (error) {
      setNotice(errorText(error));
    }
  };
  const send = async () => {
    const text = input.trim();
    if (!text || running.current || !ready) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    setNotice("");
    setInput("");
    setPanel("chat");
    follow.current = true;
    append("user", text);
    setStep(0);
    setUsage("");
    if (text.startsWith("/")) {
      const localController = new AbortController();
      abort.current = localController;
      try {
        append(
          "system",
          await routeAgent(
            text,
            { store: useDesktop, fs },
            localController.signal,
          ),
        );
      } catch (error) {
        append("system", errorText(error));
      } finally {
        abort.current = null;
        running.current = false;
        setBusy(false);
      }
      return;
    }
    if (!connected) {
      append("system", connectionIssue!);
      setPanel("settings");
      running.current = false;
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const fitted = fitConversation([
      ...history.current,
      { role: "user", content: contextPrompt(text, context) },
    ]);
    const modelMessages = fitted.messages;
    if (fitted.omitted)
      append(
        "system",
        "Older turns were omitted from model context to keep this request bounded. They remain in your transcript.",
      );
    if (context.length)
      append(
        "system",
        `Attached ${context.map((file) => file.path + (file.truncated ? " (first 16,000 characters)" : "")).join(", ")}`,
      );
    setContext([]);
    let buffered = "",
      frame: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (frame) clearTimeout(frame);
      frame = undefined;
      if (!buffered) return;
      const chunk = buffered;
      buffered = "";
      updateMessages((messages) => {
        const last = messages.at(-1);
        return last?.role === "assistant"
          ? [...messages.slice(0, -1), { ...last, text: last.text + chunk }]
          : [...messages, message("assistant", chunk)];
      });
    };
    try {
      history.current = await runAgent(
        { ...config },
        modelMessages,
        controller.signal,
        (event) => {
          if (!mounted.current) return;
          if (event.type === "text") {
            buffered += event.text;
            if (!frame) frame = setTimeout(flush, 32);
          } else if (event.type === "step") setStep(event.step);
          else if (event.type === "usage")
            setUsage(
              `${event.inputTokens?.toLocaleString() ?? "—"} in · ${event.outputTokens?.toLocaleString() ?? "—"} out · ${event.steps} step${event.steps === 1 ? "" : "s"}`,
            );
          else if (event.type === "notice") {
            flush();
            append("system", event.text);
          } else {
            flush();
            const output =
              event.output === undefined
                ? undefined
                : JSON.stringify(event.output, null, 2);
            const state =
              event.output === undefined
                ? "running"
                : event.error ||
                    (event.output &&
                      typeof event.output === "object" &&
                      "ok" in event.output &&
                      event.output.ok === false)
                  ? "error"
                  : "done";
            updateMessages((messages) => {
              const index = messages.findIndex(
                (item) => item.toolId === event.id,
              );
              const item: TranscriptMessage = {
                ...message("tool", event.name),
                toolId: event.id,
                toolName: event.name,
                toolState: state,
                input: JSON.stringify(event.input, null, 2),
                output,
              };
              if (index < 0) return [...messages, item];
              return messages.map((old, i) =>
                i === index ? { ...item, id: old.id } : old,
              );
            });
          }
        },
        (path, before, after) => {
          // Tool calls may execute concurrently; approvals must be presented one at a time.
          const pending = approvalTail.current
            .catch(() => {})
            .then(() => {
              if (controller.signal.aborted || !mounted.current) return false;
              return new Promise<boolean>((resolve) => {
                let settled = false;
                const finish = (yes: boolean) => {
                  if (settled) return;
                  settled = true;
                  controller.signal.removeEventListener("abort", cancel);
                  if (mounted.current) setApproval(null);
                  resolve(yes);
                };
                const cancel = () => finish(false);
                controller.signal.addEventListener("abort", cancel, {
                  once: true,
                });
                setApproval({ path, before, after, resolve: finish });
              });
            });
          approvalTail.current = pending;
          return pending;
        },
      );
      flush();
    } catch (error) {
      flush();
      append(
        "system",
        controller.signal.aborted
          ? "Stopped. Completed file changes remain saved. You can ask the agent to continue."
          : agentErrorText(error, config.mode),
      );
      // A partial turn may contain unmatched tool calls. Replay visible text only on retry.
      history.current = [
        ...history.current,
        { role: "user", content: text },
        {
          role: "assistant",
          content:
            "The previous turn was interrupted. Inspect current files before continuing; some actions may already have completed.",
        },
      ];
      if (!controller.signal.aborted && mounted.current) setFailed(true);
      updateMessages((messages) =>
        messages.map((item) =>
          item.toolState === "running"
            ? {
                ...item,
                toolState: "error",
                output:
                  item.output ?? "Interrupted before a result was received.",
              }
            : item,
        ),
      );
    } finally {
      if (frame) clearTimeout(frame);
      abort.current = null;
      running.current = false;
      if (mounted.current) {
        setBusy(false);
        setApproval(null);
      }
    }
  };
  const allArchives = [
    ...archives.filter((value) => value.id !== conversation.id),
    conversation,
  ]
    .filter((value) => value.messages.length)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="agent-app agent-workbench">
      <div className="agent-toolbar">
        <span
          title={
            failed
              ? "Last model request failed. See the system message below."
              : config.model || "Choose a model"
          }
        >
          <span
            className={
              failed
                ? "connection-dot failed"
                : connected
                  ? "connection-dot connected"
                  : "connection-dot"
            }
          />
          {config.model || "No model connected"}
        </span>
        <button
          title="Conversation history"
          aria-label="Conversation history"
          disabled={busy}
          onClick={() => {
            setPanel(panel === "history" ? "chat" : "history");
            setDeleteId(null);
          }}
        >
          <History size={15} />
        </button>
        <button
          title="Export transcript to files"
          aria-label="Export transcript"
          disabled={busy || !conversation.messages.length}
          onClick={() => void exportConversation()}
        >
          <FileText size={14} />
        </button>
        <button
          title="New conversation"
          aria-label="New conversation"
          disabled={busy || !ready}
          onClick={() => chooseConversation(newConversation())}
        >
          <Plus size={16} />
        </button>
        <button
          title="Model & connection"
          aria-label="Agent settings"
          disabled={busy}
          onClick={() => setPanel(panel === "settings" ? "chat" : "settings")}
        >
          <Settings2 size={15} />
        </button>
      </div>
      {notice && (
        <div className="agent-notice" role="status">
          <span>{notice}</span>
          <button
            aria-label="Dismiss agent notice"
            onClick={() => setNotice("")}
          >
            <X size={13} />
          </button>
        </div>
      )}
      {panel === "settings" ? (
        <AgentSettings onClose={() => setPanel("chat")} />
      ) : panel === "history" ? (
        <section className="agent-secondary">
          <div className="agent-secondary-title">
            <button
              aria-label="Back to conversation"
              onClick={() => setPanel("chat")}
            >
              <ChevronLeft size={16} />
            </button>
            <strong>Conversations</strong>
            <span>Stored on this device</span>
          </div>
          {!allArchives.length && <p>No conversations yet.</p>}
          {allArchives.map((value) => (
            <div className="agent-history-row" key={value.id}>
              <button onClick={() => chooseConversation(value)}>
                <strong>{value.title}</strong>
                <span>
                  {new Date(value.updatedAt).toLocaleString()} ·{" "}
                  {value.messages.filter((item) => item.role === "user").length}{" "}
                  messages
                </span>
              </button>
              <button
                aria-label={`Delete ${value.title}`}
                title={
                  deleteId === value.id
                    ? "Click again to delete permanently"
                    : "Delete conversation"
                }
                onClick={() => {
                  if (deleteId !== value.id) {
                    setDeleteId(value.id);
                    return;
                  }
                  deleted.current.add(value.id);
                  void (async () => {
                    await saving.current;
                    if (await fs.exists(`${ARCHIVE_PATH}/${value.id}.json`))
                      await fs.rm(`${ARCHIVE_PATH}/${value.id}.json`);
                    setArchives((values) =>
                      values.filter((item) => item.id !== value.id),
                    );
                    if (value.id === conversation.id) {
                      setConversation(newConversation());
                      history.current = [];
                    }
                    setDeleteId(null);
                  })().catch((error) => {
                    deleted.current.delete(value.id);
                    setNotice(errorText(error));
                  });
                }}
              >
                {deleteId === value.id ? "Delete?" : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </section>
      ) : panel === "context" ? (
        <section className="agent-secondary">
          <div className="agent-secondary-title">
            <button
              aria-label="Back to conversation"
              onClick={() => setPanel("chat")}
            >
              <ChevronLeft size={16} />
            </button>
            <strong>Attach local files</strong>
            <span>{context.length}/4</span>
          </div>
          <p>
            Selected text will be sent to your model with the next message. Up
            to 16,000 characters per file. Files are snapshots taken when
            selected.
          </p>
          <input
            aria-label="Filter context files"
            placeholder="Filter by filename…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {paths
            .filter((path) => path.toLowerCase().includes(query.toLowerCase()))
            .map((path) => (
              <button
                className="agent-context-row"
                key={path}
                onClick={() => void attach(path)}
              >
                <FileText size={14} />
                <span>{path}</span>
                {context.some((file) => file.path === path) && (
                  <Check size={14} />
                )}
              </button>
            ))}
          {!paths.length && <p>No text files found in your home directory.</p>}
          <button className="connect-button" onClick={() => setPanel("chat")}>
            Done
          </button>
        </section>
      ) : (
        <div
          className="agent-transcript"
          ref={transcriptRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            follow.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          }}
        >
          {!conversation.messages.length && (
            <div className="agent-intro">
              <TerminalSquare size={22} />
              <h1>Your agent. Your workspace.</h1>
              <p>
                {connected
                  ? "Build working apps, explore your files, or turn an idea into something useful."
                  : "Connect a model to work with your desktop. Local commands work anytime: /help."}
              </p>
              {!connected && (
                <button
                  className="connect-button"
                  onClick={() => setPanel("settings")}
                >
                  Connect a model
                  <ArrowUp size={12} />
                </button>
              )}
              <div className="agent-workflows">
                {workflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    onClick={() => {
                      setInput(workflow.prompt);
                      inputRef.current?.focus();
                    }}
                  >
                    <strong>{workflow.title}</strong>
                    <span>{workflow.detail}</span>
                  </button>
                ))}
              </div>
              <span className="offline-label">
                Local file tools · scoped edits · 12 steps per turn
              </span>
            </div>
          )}
          {conversation.messages.map((item) => (
            <div key={item.id} className={"agent-message " + item.role}>
              <span>
                {item.role === "user"
                  ? "guest"
                  : item.role === "assistant"
                    ? "agent"
                    : item.role}
              </span>
              {item.role === "tool" ? (
                <details className="agent-tool-call">
                  <summary>
                    {item.toolState === "running" ? (
                      <LoaderCircle size={13} className="spinning" />
                    ) : item.toolState === "error" ? (
                      <AlertCircle size={13} />
                    ) : (
                      <Check size={13} />
                    )}
                    <strong>{item.toolName || item.text}</strong>
                    <span>
                      {item.toolState === "running"
                        ? "Running"
                        : item.toolState === "error"
                          ? "Needs attention"
                          : "Complete"}
                    </span>
                  </summary>
                  {item.input && (
                    <>
                      <h4>Input</h4>
                      <pre>{item.input}</pre>
                    </>
                  )}
                  {item.output && (
                    <>
                      <h4>Result</h4>
                      <pre>{item.output}</pre>
                    </>
                  )}
                </details>
              ) : item.role === "assistant" ? (
                <Markdown className="agent-markdown">{item.text}</Markdown>
              ) : (
                <pre>
                  {item.text ||
                    "This earlier request failed without a recorded error message. Send again to see the current status."}
                </pre>
              )}
            </div>
          ))}
          {approval && (
            <div
              className="write-approval agent-edit-review"
              role="region"
              aria-label="Review file change"
            >
              <strong>Review file change</strong>
              <code>{approval.path}</code>
              <p>
                {approval.before.split("\n").length} lines →{" "}
                {approval.after.split("\n").length} lines ·{" "}
                {approval.after.length - approval.before.length >= 0 ? "+" : ""}
                {approval.after.length - approval.before.length} characters
              </p>
              <details>
                <summary>Current file</summary>
                <pre>{approval.before || "(empty file)"}</pre>
              </details>
              <details open>
                <summary>Proposed file</summary>
                <pre>{approval.after || "(empty file)"}</pre>
              </details>
              <div>
                <button onClick={() => approval.resolve(false)}>Decline</button>
                <button onClick={() => approval.resolve(true)}>
                  Approve this change
                </button>
              </div>
              <small>
                Only this exact change is approved. If the file changes on disk,
                the write is rejected.
              </small>
            </div>
          )}
        </div>
      )}
      {context.length > 0 && (
        <div className="agent-attachments">
          {context.map((file) => (
            <button
              key={file.path}
              title={file.path}
              disabled={busy}
              onClick={() =>
                setContext((files) =>
                  files.filter((item) => item.path !== file.path),
                )
              }
            >
              <Paperclip size={11} />
              <span>{file.path.split("/").pop()}</span>
              <X size={11} />
            </button>
          ))}
        </div>
      )}
      <form
        className="agent-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div>
          <button
            type="button"
            aria-label="Attach context files"
            title="Attach context files"
            disabled={busy}
            onClick={() => void openContext()}
          >
            <Paperclip size={15} />
          </button>
          <textarea
            ref={inputRef}
            aria-label="Agent command"
            rows={2}
            value={input}
            placeholder={
              connected
                ? "Ask, build, or type /help…"
                : "Type /help, or connect a model"
            }
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          {busy ? (
            <button
              type="button"
              aria-label="Stop agent"
              title="Stop agent"
              onClick={() =>
                abort.current?.abort(
                  new DOMException("Stopped by user", "AbortError"),
                )
              }
            >
              <Square size={13} />
            </button>
          ) : (
            <button
              aria-label="Send command"
              disabled={!input.trim() || !ready}
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
        <span>
          {busy
            ? approval
              ? "Waiting for your approval"
              : `Working · step ${step || 1}/12`
            : usage || (config.tools ? "Local tools enabled" : "Chat only")}
          <span>Enter send · Shift+Enter newline</span>
        </span>
      </form>
    </div>
  );
}
