import { mkdir,readFile,writeFile,rename,unlink } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { KeyValueStore } from '@opencoredev/loginwithchatgpt-server';
export class FileStore<T> implements KeyValueStore<T>{
 constructor(private directory:string){}
 private path(key:string){return join(this.directory,createHash('sha256').update(key).digest('hex')+'.json');}
 async get(key:string):Promise<T|undefined>{try{const entry=JSON.parse(await readFile(this.path(key),'utf8'));if(entry.expiresAt&&entry.expiresAt<Date.now()){await this.delete(key);return undefined;}return entry.value as T;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}}
 async set(key:string,value:T,options?:{ttlMs?:number}){await mkdir(this.directory,{recursive:true,mode:0o700});const path=this.path(key),temp=path+'.'+randomUUID();await writeFile(temp,JSON.stringify({value,expiresAt:options?.ttlMs?Date.now()+options.ttlMs:undefined}),{mode:0o600});await rename(temp,path);}
 async delete(key:string){try{await unlink(this.path(key));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}
export class RedisStore<T> implements KeyValueStore<T>{
 constructor(private url:string,private token:string,private prefix='oma:'){}
 private async command(args:(string|number)[]){const response=await fetch(this.url,{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store'});if(!response.ok)throw new Error('Session store unavailable');const json=await response.json();if(json.error)throw new Error('Session store operation failed');return json.result;}
 async get(key:string):Promise<T|undefined>{const result=await this.command(['GET',this.prefix+key]);return result?JSON.parse(result):undefined;}
 async set(key:string,value:T,options?:{ttlMs?:number}){await this.command(['SET',this.prefix+key,JSON.stringify(value),...(options?.ttlMs?['PX',options.ttlMs]:[])]);}
 async delete(key:string){await this.command(['DEL',this.prefix+key]);}
}
