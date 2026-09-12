export type AppId = 'term' | 'files' | 'editor' | 'agent' | 'notice';
export const apps: Record<AppId, { id: AppId; title: string; description: string; singleton?: boolean; defaultWorkspace?: number; hint?: string }> = {
  term: { id:'term',title:'Terminal',description:'The command line for your desktop',hint:'Alt+↵' },
  editor: { id:'editor',title:'Editor',description:'Read, write, make something',hint:'Alt+E' },
  files: { id:'files',title:'Files',description:'Your files, in this browser',singleton:true },
  agent: { id:'agent',title:'Agent',description:'A local command companion',singleton:true,defaultWorkspace:3,hint:'Alt+A' },
  notice: { id:'notice',title:'About oma.os',description:'The desk, in a tab',singleton:true }
};
