import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restoreDesktop} from './restore';
test('corrupt desktop persistence is rejected before it can crash boot',()=>{assert.equal(restoreDesktop(null),null);assert.equal(restoreDesktop({tiles:[]}),null);});
test('dangling and duplicate leaves are repaired, ratios bounded, invalid clients dropped',()=>{
  const restored=restoreDesktop({tiles:{a:{app:'term'},b:{app:'notes'},bad:{app:'__proto__'},orphan:{app:'term'}},workspaces:{1:{layout:{type:'split',dir:'row',ratio:9,a:{type:'leaf',id:'a'},b:{type:'leaf',id:'b'}},focus:'missing'},2:{layout:{type:'leaf',id:'a'}}},workspace:100});
  assert.equal(restored?.workspace,1);assert.equal(restored?.workspaces[1].focus,'a');
  assert.equal(restored?.workspaces[1].layout?.type==='split'&&restored.workspaces[1].layout.ratio,.9);
  assert.equal(restored?.workspaces[2].layout,null);assert.deepEqual(Object.keys(restored!.tiles),['a','b']);
});
test('missing document paths gain stable defaults without changing existing custom paths',()=>{
  const state=restoreDesktop({tiles:{a:{app:'notes'},b:{app:'canvas',path:'/home/guest/custom.oma-canvas.json'}},workspaces:{1:{layout:{type:'split',dir:'row',a:{type:'leaf',id:'a'},b:{type:'leaf',id:'b'}}}}});
  assert.match(state!.tiles.a.path!,/Notebook/);assert.equal(state!.tiles.b.path,'/home/guest/custom.oma-canvas.json');
});
