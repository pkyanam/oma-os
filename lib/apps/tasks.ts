export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high';
export type Task = {
  id: string; title: string; notes: string; status: TaskStatus;
  priority: TaskPriority; due: string; tags: string[];
  createdAt: number; updatedAt: number; completedAt?: number;
};
export type TaskBoard = { version: 1; title: string; tasks: Task[] };
export const taskColumns: { id: TaskStatus; title: string; description: string }[] = [
  { id: 'todo', title: 'To do', description: 'Make a little room for what matters.' },
  { id: 'doing', title: 'In progress', description: 'One thing at a time.' },
  { id: 'done', title: 'Done', description: 'Small steps count.' },
];
export const emptyBoard = (): TaskBoard => ({ version: 1, title: 'My work', tasks: [] });
export function parseBoard(text: string): TaskBoard {
  const input = JSON.parse(text);
  if (input?.version !== 1 || typeof input.title !== 'string' || !Array.isArray(input.tasks) || input.tasks.length > 5000)
    throw new Error('This is not a supported oma.os task board.');
  const seen = new Set<string>();
  const tasks = input.tasks.map((task: Task) => {
    if (!task || typeof task.id !== 'string' || seen.has(task.id) || typeof task.title !== 'string' || !['todo','doing','done'].includes(task.status))
      throw new Error('Task board contains an invalid or duplicate task.');
    seen.add(task.id);
    return {
      id: task.id, title: task.title.slice(0, 500), notes: typeof task.notes === 'string' ? task.notes.slice(0, 20000) : '',
      status: task.status, priority: ['low','normal','high'].includes(task.priority) ? task.priority : 'normal',
      due: typeof task.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : '',
      tags: Array.isArray(task.tags) ? task.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 20).map(tag => tag.slice(0, 50)) : [],
      createdAt: Number.isFinite(task.createdAt) ? task.createdAt : 0,
      updatedAt: Number.isFinite(task.updatedAt) ? task.updatedAt : 0,
      ...(Number.isFinite(task.completedAt) ? { completedAt: task.completedAt } : {}),
    } satisfies Task;
  });
  return { version: 1, title: input.title.slice(0, 150), tasks };
}
export function moveTask(board: TaskBoard, id: string, status: TaskStatus, now = Date.now()): TaskBoard {
  return { ...board, tasks: board.tasks.map(task => task.id === id && task.status !== status
    ? { ...task, status, updatedAt: now, completedAt: status === 'done' ? now : undefined } : task) };
}
export function taskMatches(task: Task, query: string) {
  const haystack = [task.title, task.notes, ...task.tags].join(' ').toLocaleLowerCase();
  return query.toLocaleLowerCase().trim().split(/\s+/).every(word => haystack.includes(word));
}
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function boardMarkdown(board: TaskBoard) {
  return `# ${board.title}\n\n` + taskColumns.map(column => `## ${column.title}\n\n` + board.tasks.filter(task => task.status === column.id).map(task =>
    `- [${task.status === 'done' ? 'x' : ' '}] ${task.title}${task.due ? ` · due ${task.due}` : ''}${task.tags.length ? ` · ${task.tags.map(tag => '#'+tag).join(' ')}` : ''}${task.notes ? '\n  '+task.notes.replace(/\n/g,'\n  ') : ''}`
  ).join('\n')).join('\n\n') + '\n';
}
