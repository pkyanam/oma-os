import { apps, type AppId } from '@/lib/apps/registry';
import { ids, type LayoutNode } from '@/lib/layout/tree';
import type { Tile } from './store';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
/** Reject corrupt records and repair dangling layout references before mounting clients. */
export function restoreDesktop(input: unknown) {
  if (!record(input) || !record(input.tiles) || !record(input.workspaces)) return null;
  const tiles: Record<string, Tile> = {}, used = new Set<string>();
  for (const [id, value] of Object.entries(input.tiles).slice(0, 150)) {
    if (!/^[\w-]{1,128}$/.test(id) || !record(value) || typeof value.app !== 'string' || !Object.hasOwn(apps, value.app) || value.app === 'notice') continue;
    const app = value.app as AppId;
    const path = typeof value.path === 'string' && value.path.length <= 4096 ? value.path : apps[app].defaultPath;
    tiles[id] = { app, title: typeof value.title === 'string' ? value.title.slice(0, 150) : apps[app].title, createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : 0, ...(path ? { path } : {}) };
  }
  const tree = (value: unknown, depth = 0): LayoutNode | null => {
    if (!record(value) || depth > 20) return null;
    if (value.type === 'leaf') {
      if (typeof value.id !== 'string' || !Object.hasOwn(tiles, value.id) || used.has(value.id)) return null;
      used.add(value.id); return { type:'leaf', id:value.id };
    }
    if (value.type !== 'split' || (value.dir !== 'row' && value.dir !== 'col')) return null;
    const a = tree(value.a, depth+1), b = tree(value.b, depth+1);
    if (!a) return b; if (!b) return a;
    return { type:'split', dir:value.dir, ratio:typeof value.ratio === 'number' && Number.isFinite(value.ratio) ? Math.min(.9,Math.max(.1,value.ratio)) : .5, a,b };
  };
  const workspaces: Record<number, {layout:LayoutNode|null;focus:string|null}> = {};
  for (let n=1;n<=9;n++) {
    const value = input.workspaces[n];
    const layout = record(value) ? tree(value.layout) : null, windows = ids(layout);
    workspaces[n] = { layout, focus:record(value) && typeof value.focus === 'string' && windows.includes(value.focus) ? value.focus : windows[0] ?? null };
  }
  for (const id of Object.keys(tiles)) if (!used.has(id)) delete tiles[id];
  return { tiles, workspaces, workspace:typeof input.workspace === 'number' && Number.isInteger(input.workspace) && input.workspace>=1 && input.workspace<=9 ? input.workspace : 1, theme:'tokyo-night' as const, modifier:input.modifier === 'control-shift' ? 'control-shift' as const : 'alt' as const };
}
