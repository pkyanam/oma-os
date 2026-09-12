export type AppId =
  "term" | "files" | "editor" | "agent" | "notice" | "browser" | "notes" | "canvas" | "lab" | "data" | "media" | "tasks" | "settings" | "apps" | "draw" | "database" | "activity";
export const apps: Record<
  AppId,
  {
    id: AppId;
    title: string;
    description: string;
    singleton?: boolean;
    defaultWorkspace?: number;
    hint?: string;
    category?: string;
    keywords?: string[];
    defaultPath?: string;
  }
> = {
  term: {
    id: "term",
    title: "Terminal",
    description: "The command line for your desktop",
    hint: "Alt+↵",
  },
  editor: {
    id: "editor",
    title: "Editor",
    description: "Read, write, make something",
    hint: "Alt+E",
  },
  files: {
    id: "files",
    title: "Files",
    description: "Your files, in this browser",
    singleton: true,
  },
  agent: {
    id: "agent",
    title: "Agent",
    description: "Build, research and work with your files",
    singleton: true,
    defaultWorkspace: 3,
    hint: "Alt+A",
  },
  browser: {
    id: "browser",
    title: "Browser",
    description: "Web pages and local HTML apps",
  },
  notes: { id: 'notes', title: 'Notes', description: 'Markdown, daily pages and project briefs', category: 'Think', keywords: ['notebook', 'writing', 'journal'], defaultPath: '/home/guest/Documents/Notebook.oma-notes.json' },
  canvas: { id: 'canvas', title: 'Canvas', description: 'Draw, diagram and think spatially', category: 'Create', keywords: ['whiteboard', 'drawing', 'sketch'], defaultPath: '/home/guest/Documents/Canvas.oma-canvas.json' },
  lab: { id: 'lab', title: 'Python Lab', description: 'Run Python, analyze data and generate art', category: 'Build', keywords: ['code', 'pyodide', 'sqlite', 'python'], defaultPath: '/home/guest/Projects/lab.py' },
  data: { id: 'data', title: 'Data', description: 'Explore, edit and visualize CSV tables', category: 'Build', keywords: ['spreadsheet', 'csv', 'chart', 'table'] },
  media: { id: 'media', title: 'Media', description: 'Images, music, video and PDF files', category: 'Create', keywords: ['photo', 'audio', 'video', 'pdf'] },
  tasks: { id: 'tasks', title: 'Tasks', description: 'Plan work, track progress and focus', category: 'Think', keywords: ['kanban', 'todo', 'focus', 'timer'], defaultPath: '/home/guest/Documents/My work.oma-tasks.json' },
  settings: { id: 'settings', title: 'Settings', description: 'Desktop preferences, storage and portable backups', category: 'System', singleton: true, keywords: ['backup','restore','keyboard','install'] },
  apps: { id: 'apps', title: 'Applications', description: 'Find your tools and install editable local apps', category: 'System', singleton: true, keywords: ['app store','gallery','templates','music','image','regex'] },
  draw: { id:'draw', title:'Excalidraw', description:'The open-source infinite canvas, with your local files', category:'Create', keywords:['whiteboard','diagram','sketch'], defaultPath:'/home/guest/Documents/Sketch.excalidraw' },
  database: { id:'database', title:'SQL Workbench', description:'Real PostgreSQL in your browser, powered by PGlite', category:'Build', keywords:['postgres','pglite','sql','database','query'], singleton:true, defaultPath:'/home/guest/Documents/Workbench.sql' },
  activity: { id:'activity', title:'Activity', description:'Inspect and export this desktop session’s activity', category:'System', singleton:true, keywords:['events','history','diagnostics'] },
  notice: {
    id: "notice",
    title: "About oma.os",
    description: "The desk, in a tab",
    singleton: true,
  },
};
