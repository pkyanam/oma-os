import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoard, moveTask, taskMatches, localDay, boardMarkdown, type TaskBoard } from './tasks';
const board: TaskBoard = { version:1, title:'Launch', tasks:[{id:'one',title:'Ship the idea',notes:'Use the browser',status:'doing',priority:'high',due:'2026-09-12',tags:['creative'],createdAt:1,updatedAt:1}] };
test('task board round-trips as a portable versioned document', () => assert.deepEqual(parseBoard(JSON.stringify(board)), board));
test('invalid or duplicate task IDs cannot enter a board', () => {
  assert.throws(()=>parseBoard(JSON.stringify({...board,tasks:[board.tasks[0],board.tasks[0]]})), /duplicate/);
  assert.throws(()=>parseBoard('{"version":7}'), /supported/);
});
test('moving a task stamps completion and reopening clears it without mutating input', () => {
  const done = moveTask(board,'one','done',100);
  assert.equal(done.tasks[0].completedAt,100);
  assert.equal(board.tasks[0].status,'doing');
  assert.equal(moveTask(done,'one','todo',200).tasks[0].completedAt,undefined);
});
test('search matches all words across notes and tags', () => {
  assert.equal(taskMatches(board.tasks[0], 'creative browser'),true);
  assert.equal(taskMatches(board.tasks[0], 'creative banana'),false);
});
test('markdown export retains work and completion state', () => assert.match(boardMarkdown(moveTask(board,'one','done',10)), /\[x\] Ship the idea.*#creative/));
test('local-day formatting does not round-trip through UTC', () => assert.equal(localDay(new Date(2026,8,12,23)), '2026-09-12'));
