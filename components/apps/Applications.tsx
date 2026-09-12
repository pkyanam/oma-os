"use client";
import { useEffect, useState } from "react";
import {
  Search,
  BookOpen,
  CheckSquare,
  Globe2,
  PenTool,
  Image,
  FlaskConical,
  Table2,
  Code2,
  Bot,
  TerminalSquare,
  Folder,
  Settings,
  Music2,
  Regex,
  Play,
  FileCode2,
  Plus,
  RefreshCw,
  X,
  ArrowRight,
  Clock3,
  Database,
  HelpCircle,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { useDesktop } from "@/lib/state/store";
import { apps, type AppId } from "@/lib/apps/registry";
import { fs, errorMessage } from "@/lib/fs/opfs";
import {
  builtinCatalog,
  categories,
  appTemplates,
  discoverApplications,
  installTemplate,
  hideApplication,
  type AppCategory,
  type LocalApplication,
  type AppTemplate,
} from "@/lib/apps/catalog";
import "./applications.css";
import ApplicationHelp from "./ApplicationHelp";
const icons: Record<string, LucideIcon> = {
  notebook: BookOpen,
  tasks: CheckSquare,
  globe: Globe2,
  canvas: PenTool,
  image: Image,
  flask: FlaskConical,
  table: Table2,
  code: Code2,
  agent: Bot,
  terminal: TerminalSquare,
  folder: Folder,
  settings: Settings,
  music: Music2,
  regex: Regex,
  draw: PenTool,
  sql: Database,
  activity: Activity,
};
export default function Applications({ active }: { active: boolean }) {
  const [showHelp, setShowHelp] = useState(false);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<AppCategory | "All" | "Local">("All"),
    [local, setLocal] = useState<LocalApplication[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [remove, setRemove] = useState<LocalApplication | null>(null),
    [refresh, setRefresh] = useState(0);
  const version = useDesktop((s) => s.fsVersion);
  useEffect(() => {
    let cancelled = false;
    discoverApplications()
      .then((items) => {
        if (!cancelled) setLocal(items);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [version, refresh]);
  const match = (...text: string[]) =>
    text.join(" ").toLowerCase().includes(query.toLowerCase());
  const launch = (id: string, path?: string) => {
    if (!Object.hasOwn(apps, id)) {
      setError("This app is not available in this build yet.");
      return;
    }
    useDesktop.getState().launch(id as AppId, path);
  };
  const install = async (template: AppTemplate) => {
    if (busy) return;
    setBusy(template.slug);
    setError("");
    try {
      const path = await installTemplate(template);
      useDesktop.getState().refreshFs();
      launch("browser", path);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  const builtins = builtinCatalog.filter(
    (app) =>
      (category === "All" || app.category === category) &&
      match(app.title, app.description, ...app.keywords),
  );
  const templates = appTemplates.filter((app) =>
    match(app.title, app.description),
  );
  const installed = local.filter((app) => match(app.title, app.description));
  const showLocal = category === "All" || category === "Local";
  if (showHelp)
    return (
      <div className="applications-app">
        <ApplicationHelp onBack={() => setShowHelp(false)} />
      </div>
    );
  return (
    <div
      className="applications-app"
      onKeyDown={(event) => {
        if (active && event.key === "Escape") {
          setRemove(null);
          setQuery("");
        }
      }}
    >
      <header className="applications-header">
        <div>
          <strong>Applications</strong>
          <span>Your tools. Your source. Your desk.</span>
        </div>
        <button
          className="applications-help-button"
          aria-label="Help & diagnostics"
          onClick={() => setShowHelp(true)}
        >
          <HelpCircle size={15} />
          <span>Help & diagnostics</span>
        </button>
        <button
          aria-label="Refresh applications"
          onClick={() => setRefresh((v) => v + 1)}
        >
          <RefreshCw size={15} />
        </button>
      </header>
      <div className="applications-controls">
        <label>
          <Search size={15} />
          <input
            aria-label="Search applications"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an app or a use case…"
          />
        </label>
        <nav aria-label="Application categories">
          {(["All", ...categories, "Local"] as const).map((item) => (
            <button
              key={item}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </div>
      {error && (
        <div className="applications-error" role="alert">
          {error}
          <button
            aria-label="Dismiss application error"
            onClick={() => setError("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="applications-scroll">
        {category === "All" && !query && (
          <div className="applications-welcome-strip">
            <span>Desktop ready. A model is optional.</span>
            <button onClick={() => setShowHelp(true)}>
              Start here <ArrowRight size={12} />
            </button>
          </div>
        )}
        {builtins.length > 0 && (
          <section>
            <div className="applications-section">
              <h2>{category === "All" ? "On your desktop" : category}</h2>
              <span>{builtins.length} apps</span>
            </div>
            <div className="applications-grid">
              {builtins.map((app) => {
                const Icon = icons[app.icon] || Code2;
                return (
                  <button
                    className="application-card builtin"
                    key={app.id}
                    onClick={() => launch(app.id)}
                  >
                    <div className="application-icon">
                      <Icon size={21} />
                    </div>
                    <div>
                      <strong>{app.title}</strong>
                      <p>{app.description}</p>
                      <span>{app.category}</span>
                    </div>
                    <ArrowRight size={13} className="application-go" />
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {showLocal && templates.length > 0 && (
          <section>
            <div className="applications-section">
              <h2>Make it yours</h2>
              <span>Editable, local HTML apps</span>
            </div>
            <div className="applications-grid">
              {templates.map((template) => {
                const Icon = icons[template.icon] || Code2,
                  isInstalled = local.some((app) => app.slug === template.slug);
                return (
                  <article
                    className="application-card template"
                    key={template.slug}
                  >
                    <div className="application-icon">
                      <Icon size={21} />
                    </div>
                    <div>
                      <strong>{template.title}</strong>
                      <p>{template.description}</p>
                      <div className="application-actions">
                        <button
                          disabled={!!busy}
                          onClick={() => void install(template)}
                        >
                          {busy === template.slug ? (
                            "Preparing…"
                          ) : isInstalled ? (
                            <>
                              <Play size={12} />
                              Open
                            </>
                          ) : (
                            <>
                              <Plus size={12} />
                              Add to desktop
                            </>
                          )}
                        </button>
                        {isInstalled && (
                          <button
                            title="Edit app source"
                            aria-label={`Edit ${template.title} source`}
                            onClick={() =>
                              launch(
                                "editor",
                                local.find((app) => app.slug === template.slug)
                                  ?.path,
                              )
                            }
                          >
                            <FileCode2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="applications-hint">
              Adding an app copies its source into your Applications folder.
              Your edits are kept when you open it again.
            </p>
          </section>
        )}
        {showLocal && installed.length > 0 && (
          <section>
            <div className="applications-section">
              <h2>Your applications</h2>
              <span>{installed.length} local</span>
            </div>
            <div className="applications-local-list">
              {installed.map((app) => (
                <div className="application-local" key={app.path}>
                  <Code2 size={18} />
                  <div>
                    <strong>{app.title}</strong>
                    <code title={app.path}>{app.path}</code>
                  </div>
                  <button
                    aria-label={`Open ${app.title}`}
                    onClick={() => launch("browser", app.path)}
                  >
                    <Play size={14} />
                  </button>
                  <button
                    aria-label={`Edit ${app.title}`}
                    onClick={() => launch("editor", app.path)}
                  >
                    <FileCode2 size={15} />
                  </button>
                  <button
                    aria-label={`Remove ${app.title} registration`}
                    onClick={() => setRemove(app)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        {showLocal && !query && (
          <section>
            <div className="applications-section">
              <h2>Start a working session</h2>
              <span>Useful combinations</span>
            </div>
            <div className="applications-workflows">
              <button
                onClick={() => {
                  launch("browser");
                  launch("notes");
                }}
              >
                <BookOpen size={17} />
                <span>
                  <strong>Research notebook</strong>
                  <small>Read in Browser. Keep conclusions in Notes.</small>
                </span>
                <ArrowRight size={14} />
              </button>
              <button
                onClick={() => {
                  launch("data");
                  launch("lab");
                }}
              >
                <FlaskConical size={17} />
                <span>
                  <strong>A data story</strong>
                  <small>
                    Inspect a table and turn it into a Python report.
                  </small>
                </span>
                <ArrowRight size={14} />
              </button>
              <button
                onClick={() => {
                  launch("tasks");
                  launch("canvas");
                }}
              >
                <PenTool size={17} />
                <span>
                  <strong>Map a project</strong>
                  <small>Draw the system, then plan the next steps.</small>
                </span>
                <ArrowRight size={14} />
              </button>
              <button
                onClick={async () => {
                  const path = "/home/guest/Projects/interval.html";
                  try {
                    if (await fs.exists(path)) launch("browser", path);
                    else
                      setError("The Interval source is missing from Projects.");
                  } catch (error) {
                    setError(errorMessage(error));
                  }
                }}
              >
                <Clock3 size={17} />
                <span>
                  <strong>One thing at a time</strong>
                  <small>A local 25 / 50 / 5 minute interval timer.</small>
                </span>
                <ArrowRight size={14} />
              </button>
            </div>
          </section>
        )}
        {!builtins.length &&
          (!showLocal || (!templates.length && !installed.length)) && (
            <div className="applications-empty">
              <Search size={24} />
              <p>No applications match “{query}”.</p>
              <button
                onClick={() => {
                  setQuery("");
                  setCategory("All");
                }}
              >
                Show all applications
              </button>
            </div>
          )}
        {category === "Local" && !query && (
          <div className="applications-own">
            <FileCode2 size={18} />
            <div>
              <strong>Bring your own app</strong>
              <p>
                Put an <code>index.html</code> in a folder inside{" "}
                <code>/home/guest/Applications</code>. It appears here
                automatically. Optional <code>.oma-app.json</code> metadata adds
                a title and description.
              </p>
              <button
                onClick={() => launch("files", "/home/guest/Applications")}
              >
                Open Files <ArrowRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
      {remove && (
        <div
          className="applications-confirm"
          role="alertdialog"
          aria-label="Remove app registration"
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const first = buttons[0],
              last = buttons.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <strong>Remove {remove.title} from this list?</strong>
          <p>
            Its source files stay in Applications. You can still open them from
            Files. Adding the template again restores its listing.
          </p>
          <div>
            <button autoFocus onClick={() => setRemove(null)}>
              Keep app
            </button>
            <button
              className="danger"
              onClick={async () => {
                try {
                  await hideApplication(remove);
                  setRemove(null);
                  useDesktop.getState().refreshFs();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Remove registration
            </button>
          </div>
        </div>
      )}
      <footer className="applications-footer">
        <span>
          {builtinCatalog.length} built-in tools · {local.length} local apps
        </span>
        <span>Made to be used</span>
      </footer>
    </div>
  );
}
