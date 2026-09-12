import { fs } from "@/lib/fs/opfs";
export type AppCategory = "Think" | "Create" | "Build" | "System";
export const categories: AppCategory[] = ["Think", "Create", "Build", "System"];
export type CatalogApp = {
  id: string;
  title: string;
  description: string;
  category: AppCategory;
  icon: string;
  keywords: string[];
};
export const builtinCatalog: CatalogApp[] = [
  {
    id: "notes",
    title: "Notes",
    description: "Write, search, and export Markdown notes.",
    category: "Think",
    icon: "notebook",
    keywords: ["writing", "journal", "markdown"],
  },
  {
    id: "tasks",
    title: "Tasks",
    description: "Track tasks, deadlines, and focused work.",
    category: "Think",
    icon: "tasks",
    keywords: ["kanban", "todo", "focus"],
  },
  {
    id: "browser",
    title: "Browser",
    description: "Browse websites and open local HTML apps.",
    category: "Think",
    icon: "globe",
    keywords: ["web", "internet", "research"],
  },
  {
    id: "canvas",
    title: "Canvas",
    description: "Draw shapes, arrows, and diagrams.",
    category: "Create",
    icon: "canvas",
    keywords: ["draw", "whiteboard", "svg"],
  },
  {
    id: "draw",
    title: "Excalidraw",
    description: "Sketch on an infinite canvas with Excalidraw.",
    category: "Create",
    icon: "draw",
    keywords: ["excalidraw", "whiteboard", "diagram", "MIT"],
  },
  {
    id: "database",
    title: "SQL Workbench",
    description: "Query and manage a local PostgreSQL database.",
    category: "Build",
    icon: "sql",
    keywords: ["postgresql", "database", "sql", "pglite"],
  },
  {
    id: "media",
    title: "Media",
    description: "Open images, audio, video, and PDFs.",
    category: "Create",
    icon: "image",
    keywords: ["music", "video", "photo", "pdf"],
  },
  {
    id: "lab",
    title: "Python Lab",
    description: "Run Python and generate plots and reports.",
    category: "Build",
    icon: "flask",
    keywords: ["python", "code", "compute"],
  },
  {
    id: "data",
    title: "Data",
    description: "Edit CSV tables and chart their data.",
    category: "Build",
    icon: "table",
    keywords: ["csv", "spreadsheet", "charts"],
  },
  {
    id: "editor",
    title: "Editor",
    description: "Edit code and run HTML files.",
    category: "Build",
    icon: "code",
    keywords: ["monaco", "html", "javascript"],
  },
  {
    id: "agent",
    title: "Agent",
    description: "Delegate work using your files and tools.",
    category: "Build",
    icon: "agent",
    keywords: ["ai", "automation", "chatgpt"],
  },
  {
    id: "term",
    title: "Terminal",
    description: "Run shell commands and control the desktop.",
    category: "System",
    icon: "terminal",
    keywords: ["bash", "shell", "commands"],
  },
  {
    id: "files",
    title: "Files",
    description: "Organize, import, and export files.",
    category: "System",
    icon: "folder",
    keywords: ["storage", "opfs", "download"],
  },
  {
    id: "activity",
    title: "Session Activity",
    description:
      "Inspect desktop events, changed files, and agent activity in this session.",
    category: "System",
    icon: "activity",
    keywords: ["events", "audit", "history", "session"],
  },
  {
    id: "settings",
    title: "Settings",
    description: "Keyboard preferences, storage, and backups.",
    category: "System",
    icon: "settings",
    keywords: ["backup", "preferences", "keyboard"],
  },
];
export type AppTemplate = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  source: string;
};
export const appTemplates: AppTemplate[] = [
  {
    slug: "pulse",
    title: "Pulse",
    description: "Compose 16-step synth and drum patterns.",
    icon: "music",
    source: "/templates/pulse.html",
  },
  {
    slug: "image-studio",
    title: "Image Studio",
    description: "Crop, resize, adjust, and export images.",
    icon: "image",
    source: "/templates/image-studio.html",
  },
  {
    slug: "regex-lab",
    title: "Regex Lab",
    description: "Test patterns, inspect matches, and transform text safely.",
    icon: "regex",
    source: "/templates/regex-lab.html",
  },
];
export const applicationRoot = "/home/guest/Applications";
export type LocalApplication = {
  slug: string;
  title: string;
  description: string;
  path: string;
  directory: string;
  registered: boolean;
};
export function parseAppManifest(raw: string): {
  title?: string;
  description?: string;
  hidden?: boolean;
} {
  if (raw.length > 16384) throw new Error("App metadata is too large.");
  const v = JSON.parse(raw);
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid app metadata.");
  return {
    title: typeof v.title === "string" ? v.title.slice(0, 80) : undefined,
    description:
      typeof v.description === "string"
        ? v.description.slice(0, 240)
        : undefined,
    hidden: v.hidden === true,
  };
}
export function applicationDirectory(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug))
    throw new Error("Invalid application name.");
  return `${applicationRoot}/${slug}`;
}
export async function discoverApplications(): Promise<LocalApplication[]> {
  await fs.mkdir(applicationRoot);
  const directories = (await fs.ls(applicationRoot))
    .filter((entry) => entry.kind === "directory")
    .slice(0, 100);
  const apps: LocalApplication[] = [];
  for (const entry of directories) {
    const path = `${entry.path}/index.html`;
    if (!(await fs.exists(path))) continue;
    let metadata: ReturnType<typeof parseAppManifest> = {};
    try {
      metadata = parseAppManifest(await fs.read(`${entry.path}/.oma-app.json`));
    } catch {
      /* An HTML application remains launchable without optional metadata. */
    }
    if (metadata.hidden) continue;
    apps.push({
      slug: entry.name,
      title: metadata.title || entry.name,
      description: metadata.description || "A local HTML application.",
      path,
      directory: entry.path,
      registered: !!metadata.title,
    });
  }
  return apps.sort((a, b) => a.title.localeCompare(b.title));
}
export async function installTemplate(template: AppTemplate): Promise<string> {
  if (
    !appTemplates.some(
      (item) => item.slug === template.slug && item.source === template.source,
    )
  )
    throw new Error("Unknown application template.");
  const install = async () => {
    const directory = applicationDirectory(template.slug),
      path = `${directory}/index.html`,
      manifest = `${directory}/.oma-app.json`;
    await fs.mkdir(directory);
    if (!(await fs.exists(path))) {
      const response = await fetch(template.source, { credentials: "omit" });
      if (!response.ok)
        throw new Error(
          `${template.title} is not available in this build yet.`,
        );
      const body = await response.text();
      if (body.length > 2_000_000 || !/<html|<!doctype/i.test(body))
        throw new Error("Invalid app template.");
      await fs.touch(path);
      await fs.write(path, body, "");
    }
    if (!(await fs.exists(manifest))) {
      await fs.touch(manifest);
      await fs.write(
        manifest,
        JSON.stringify(
          {
            version: 1,
            title: template.title,
            description: template.description,
            hidden: false,
          },
          null,
          2,
        ),
        "",
      );
    } else {
      const raw = await fs.read(manifest);
      const previous = parseAppManifest(raw);
      if (previous.hidden)
        await fs.write(
          manifest,
          JSON.stringify({ ...JSON.parse(raw), hidden: false }, null, 2),
          raw,
        );
    }
    return path;
  };
  return navigator.locks
    ? navigator.locks.request(`oma-install:${template.slug}`, install)
    : install();
}
/** Removing a registration preserves source and user data. */
export async function hideApplication(app: LocalApplication) {
  if (
    !app.directory.startsWith(applicationRoot + "/") ||
    fs.normalize(app.directory) !== app.directory ||
    app.directory.slice(applicationRoot.length + 1).includes("/")
  )
    throw new Error("Invalid application directory.");
  const path = `${app.directory}/.oma-app.json`;
  let expected = "";
  if (await fs.exists(path)) expected = await fs.read(path);
  else await fs.touch(path);
  await fs.write(
    path,
    JSON.stringify(
      {
        version: 1,
        title: app.title,
        description: app.description,
        hidden: true,
      },
      null,
      2,
    ),
    expected,
  );
}
