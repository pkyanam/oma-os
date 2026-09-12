export type Entry = { name:string; path:string; kind:'file'|'directory'; size?:number };
export function normalize(path:string):string {
  const parts:string[]=[];
  for(const part of (path.startsWith('/')?path:'/home/guest/'+path).split('/')) { if(!part||part==='.')continue;if(part==='..'){parts.pop();continue;}if(part.includes('\0'))throw new Error('Invalid path');parts.push(part); }
  return '/'+parts.join('/');
}
async function root(){ if(!navigator.storage?.getDirectory)throw new Error('OPFS is unavailable. Use a current browser on localhost or HTTPS.');return navigator.storage.getDirectory(); }
async function directory(path:string,create=false){let dir=await root();for(const name of normalize(path).split('/').filter(Boolean))dir=await dir.getDirectoryHandle(name,{create});return dir;}
async function parent(path:string,create=false){const full=normalize(path),parts=full.split('/').filter(Boolean),name=parts.pop();if(!name)throw new Error('A file path is required');return {dir:await directory('/'+parts.join('/'),create),name};}
export const fs = {
  normalize,
  async ls(path='/home/guest'):Promise<Entry[]> {const full=normalize(path),dir=await directory(full),items:Entry[]=[];for await(const [name,handle] of (dir as FileSystemDirectoryHandle & {entries():AsyncIterableIterator<[string,FileSystemHandle]>}).entries()){items.push({name,path:full==='/'?'/'+name:full+'/'+name,kind:handle.kind,...(handle.kind==='file'?{size:(await (handle as FileSystemFileHandle).getFile()).size}:{})});}return items.sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==='directory'?-1:1);},
  async read(path:string){const {dir,name}=await parent(path);return (await (await dir.getFileHandle(name)).getFile()).text();},
  async write(path:string,body:string){const {dir,name}=await parent(path);const file=await dir.getFileHandle(name,{create:true}),stream=await file.createWritable();await stream.write(body);await stream.close();},
  async touch(path:string){const {dir,name}=await parent(path);await dir.getFileHandle(name,{create:true});},
  async mkdir(path:string){await directory(path,true);},
  async rm(path:string){const full=normalize(path);if(full==='/'||full==='/home'||full==='/home/guest'||full==='/.oma')throw new Error('Protected directory. Use oma reset --yes to reset the machine.');const {dir,name}=await parent(full);await dir.removeEntry(name);},
  async exists(path:string){try{await fs.read(path);return true;}catch(error){if(error instanceof DOMException&&error.name==='NotFoundError')return false;throw error;}},
  async reset(){const dir=await root();for await(const [name] of (dir as FileSystemDirectoryHandle & {entries():AsyncIterableIterator<[string,FileSystemHandle]>}).entries())await dir.removeEntry(name,{recursive:true});},
  async search(path='/home/guest',limit=20):Promise<Entry[]>{const result:Entry[]=[];const walk=async(p:string,depth:number)=>{if(depth>8||result.length>=limit)return;for(const entry of await fs.ls(p)){if(result.length>=limit)return;if(entry.kind==='directory')await walk(entry.path,depth+1);else result.push(entry);}};await walk(path,0);return result;}
};
export function errorMessage(error:unknown){if(error instanceof DOMException&&error.name==='NotFoundError')return 'No such file or directory';return error instanceof Error?error.message:String(error);}
