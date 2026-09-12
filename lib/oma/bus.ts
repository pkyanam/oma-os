import { fs, errorMessage } from '@/lib/fs/opfs';
import { seed } from '@/lib/fs/seed';
import { apps, type AppId } from '@/lib/apps/registry';
import type { useDesktop } from '@/lib/state/store';
import type { Direction } from '@/lib/layout/tree';
export type OmaResult = {ok:true;message:string;data?:unknown}|{ok:false;message:string};
export type BusContext = {store:Pick<typeof useDesktop,'getState'>;fs:typeof fs;tileId?:string;stdin?:string};
const help='oma help · version · theme [list|set tokyo-night]\noma ws [1–9] · launch term|files|editor|agent · close\noma focus left|right|up|down · swap left|right|up|down\noma fs ls [path] · read <path> · write <path> <text>\noma agent status · snapshot list · reset --yes';
export async function oma(argv:string[],ctx:BusContext):Promise<OmaResult>{
 const [cmd='help',sub,...rest]=argv,s=ctx.store.getState(),ok=(message:string,data?:unknown):OmaResult=>({ok:true,message,data}),fail=(message:string):OmaResult=>({ok:false,message});
 try{switch(cmd){
 case 'help':return ok(help);
 case 'version':return ok('oma.os 0.1.0');
 case 'theme':if(!sub||sub==='list')return ok('tokyo-night');if(sub==='set'){if(rest[0]!=='tokyo-night')return fail('not in v1');s.notify('Tokyo Night is active');return ok('ok: tokyo-night');}return fail('usage: oma theme [list|set <id>]');
 case 'ws':if(sub===undefined)return ok(`workspace ${s.workspace} · focus ${s.workspaces[s.workspace].focus??'none'}`);if(!/^[1-9]$/.test(sub))return fail('workspace must be 1–9');s.gotoWs(Number(sub));return ok(`workspace ${sub}`);
 case 'launch':if(!sub||!Object.hasOwn(apps,sub))return fail('usage: oma launch term|files|editor|agent');s.launch(sub as AppId);return ok(`opened ${sub}`);
 case 'close':{const id=ctx.tileId??s.workspaces[s.workspace].focus;if(!id)return fail('No focused window');if(s.dirty[id])return fail('File is still saving. Wait before closing.');s.closeTile(id);return ok('closed');}
 case 'focus':case 'swap':if(!['left','right','up','down'].includes(sub))return fail(`usage: oma ${cmd} left|right|up|down`);s.focusDir(sub as Direction,cmd==='swap');return ok(`${cmd} ${sub}`);
 case 'reset':if(sub!=='--yes')return fail('Reset deletes all local files. Run oma reset --yes to confirm.');if(Object.values(s.dirty).some(Boolean))return fail('Wait for pending file saves before resetting.');await ctx.fs.reset();await seed();s.reset();s.refreshFs();s.setOverlay('welcome');return ok('machine reset');
 case 'fs':if(sub==='ls'){const rows=await ctx.fs.ls(rest[0]);return ok(rows.length?rows.map(r=>r.name+(r.kind==='directory'?'/':'')).join('\n'):'(empty)',rows);}if(sub==='read'){if(!rest[0])return fail('usage: oma fs read <path>');return ok(await ctx.fs.read(rest[0]));}if(sub==='write'){if(!rest[0])return fail('usage: oma fs write <path> <text>');await ctx.fs.write(rest[0],ctx.stdin??rest.slice(1).join(' '));s.refreshFs();return ok(`saved ${ctx.fs.normalize(rest[0])}`);}return fail('usage: oma fs ls|read|write');
 case 'snapshot':return sub==='list'?ok('snapshots: Phase 1.5'):fail('usage: oma snapshot list');
 case 'agent':return sub==='status'?ok('offline'):fail('usage: oma agent status');
 default:return fail(`unknown oma command: ${cmd}`);
 }}catch(error){return fail(errorMessage(error));}
}
