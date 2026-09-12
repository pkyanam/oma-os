export type Direction = 'left' | 'right' | 'up' | 'down';
export type LayoutNode = { type: 'leaf'; id: string } | { type: 'split'; dir: 'row' | 'col'; ratio: number; a: LayoutNode; b: LayoutNode };
export type Rect = { id: string; x: number; y: number; w: number; h: number };
export const leaf = (id: string): LayoutNode => ({ type: 'leaf', id });
export const clamp = (n: number) => Math.max(.2, Math.min(.8, n));
export function ids(n: LayoutNode | null): string[] { return !n ? [] : n.type === 'leaf' ? [n.id] : [...ids(n.a), ...ids(n.b)]; }
export function split(n: LayoutNode | null, target: string | null, id: string, depth = 0): LayoutNode {
  if (!n) return leaf(id);
  if (n.type === 'leaf') return n.id === target ? { type: 'split', dir: depth % 2 ? 'col' : 'row', ratio: .5, a: n, b: leaf(id) } : n;
  return { ...n, a: split(n.a, target, id, depth + 1), b: split(n.b, target, id, depth + 1) };
}
export function close(n: LayoutNode | null, id: string): LayoutNode | null {
  if (!n) return null;
  if (n.type === 'leaf') return n.id === id ? null : n;
  const a = close(n.a, id), b = close(n.b, id);
  return !a ? b : !b ? a : { ...n, a, b };
}
export function swap(n: LayoutNode, a: string, b: string): LayoutNode {
  return n.type === 'leaf' ? leaf(n.id === a ? b : n.id === b ? a : n.id) : { ...n, a: swap(n.a, a, b), b: swap(n.b, a, b) };
}
export function setRatio(n: LayoutNode, path: string, ratio: number): LayoutNode {
  if (n.type === 'leaf') return n;
  if (!path) return { ...n, ratio: clamp(ratio) };
  return path[0] === 'a' ? { ...n, a: setRatio(n.a, path.slice(1), ratio) } : { ...n, b: setRatio(n.b, path.slice(1), ratio) };
}
export function grow(n: LayoutNode, id: string, delta: number): LayoutNode {
  if (n.type === 'leaf') return n;
  if (n.a.type === 'leaf' && n.a.id === id) return { ...n, ratio: clamp(n.ratio + delta) };
  if (n.b.type === 'leaf' && n.b.id === id) return { ...n, ratio: clamp(n.ratio - delta) };
  return { ...n, a: grow(n.a, id, delta), b: grow(n.b, id, delta) };
}
export function geometry(n: LayoutNode | null, x = 0, y = 0, w = 1, h = 1): Rect[] {
  if (!n) return [];
  if (n.type === 'leaf') return [{ id: n.id, x, y, w, h }];
  return n.dir === 'row' ? [...geometry(n.a, x, y, w*n.ratio, h), ...geometry(n.b, x+w*n.ratio, y, w*(1-n.ratio), h)] : [...geometry(n.a, x, y, w, h*n.ratio), ...geometry(n.b, x, y+h*n.ratio, w, h*(1-n.ratio))];
}
export function neighbor(n: LayoutNode | null, id: string, dir: Direction): string | null {
  const boxes = geometry(n), from = boxes.find(r => r.id === id); if (!from) return null;
  const horizontal = dir === 'left' || dir === 'right', sign = dir === 'left' || dir === 'up' ? -1 : 1;
  return boxes.filter(r => r.id !== id).map(r => {
    const dx = (r.x+r.w/2) - (from.x+from.w/2), dy = (r.y+r.h/2) - (from.y+from.h/2);
    const main = horizontal ? dx : dy, cross = horizontal ? dy : dx;
    const overlap = horizontal ? Math.min(from.y+from.h,r.y+r.h)-Math.max(from.y,r.y) : Math.min(from.x+from.w,r.x+r.w)-Math.max(from.x,r.x);
    return { id: r.id, valid: main*sign > .001, score: Math.abs(main)+Math.abs(cross)*2+(overlap <= 0 ? 10 : 0) };
  }).filter(r=>r.valid).sort((a,b)=>a.score-b.score)[0]?.id ?? null;
}
