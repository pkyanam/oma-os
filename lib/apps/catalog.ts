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
    description:
      "Daily pages, project briefs, and a searchable Markdown notebook.",
    category: "Think",
    icon: "notebook",
    keywords: ["writing", "journal", "markdown"],
  },
  {
    id: "tasks",
    title: "Tasks",
    description:
      "Plan the next step, track progress, and protect a little focus.",
    category: "Think",
    icon: "tasks",
    keywords: ["kanban", "todo", "focus"],
  },
  {
    id: "browser",
    title: "Browser",
    description: "Explore websites and run your own local HTML applications.",
    category: "Think",
    icon: "globe",
    keywords: ["web", "internet", "research"],
  },
  {
    id: "canvas",
    title: "Canvas",
    description: "Sketch an idea, map a system, and export a diagram.",
    category: "Create",
    icon: "canvas",
    keywords: ["draw", "whiteboard", "svg"],
  },
  {
    id: "draw",
    title: "Excalidraw",
    description:
      "The MIT-licensed infinite canvas. Diagram, sketch, and keep editable Excalidraw scenes.",
    category: "Create",
    icon: "draw",
    keywords: ["excalidraw", "whiteboard", "diagram", "MIT"],
  },
  {
    id: "database",
    title: "SQL Workbench",
    description:
      "Real PostgreSQL in your browser, powered by the Apache-licensed PGlite runtime.",
    category: "Build",
    icon: "sql",
    keywords: ["postgresql", "database", "sql", "pglite"],
  },
  {
    id: "media",
    title: "Media",
    description: "Your photographs, audio, video, and PDF documents.",
    category: "Create",
    icon: "image",
    keywords: ["music", "video", "photo", "pdf"],
  },
  {
    id: "lab",
    title: "Python Lab",
    description: "Execute real Python, explore data, and generate reports.",
    category: "Build",
    icon: "flask",
    keywords: ["python", "code", "compute"],
  },
  {
    id: "data",
    title: "Data",
    description: "Edit a CSV table, inspect numbers, and see the story.",
    category: "Build",
    icon: "table",
    keywords: ["csv", "spreadsheet", "charts"],
  },
  {
    id: "editor",
    title: "Editor",
    description: "A code editor for the files and applications on your desk.",
    category: "Build",
    icon: "code",
    keywords: ["monaco", "html", "javascript"],
  },
  {
    id: "agent",
    title: "Agent",
    description: "Delegate work with your files, tools, and model of choice.",
    category: "Build",
    icon: "agent",
    keywords: ["ai", "automation", "chatgpt"],
  },
  {
    id: "term",
    title: "Terminal",
    description: "A real browser shell and the command bus for your OS.",
    category: "System",
    icon: "terminal",
    keywords: ["bash", "shell", "commands"],
  },
  {
    id: "files",
    title: "Files",
    description:
      "Organize, import, export, and inspect your browser filesystem.",
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
    description: "Make the desktop yours and keep a portable backup.",
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
    description:
      "Compose a 16-step synth and drum pattern. Make a loop of your own.",
    icon: "music",
    source: "/templates/pulse.html",
  },
  {
    slug: "image-studio",
    title: "Image Studio",
    description:
      "Crop, resize, recolor, and export images without uploading them.",
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
      description:
        metadata.description ||
        "A local HTML application. Open its source and make it yours.",
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
