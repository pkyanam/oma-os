import { cp, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = resolve(project, '.next/standalone');
try { await access(resolve(standalone, 'server.js')); }
catch { console.error('Build oma.os first with npm run build.'); process.exit(1); }
await cp(resolve(project, 'public'), resolve(standalone, 'public'), { recursive:true });
await cp(resolve(project, '.next/static'), resolve(standalone, '.next/static'), { recursive:true });
const child = spawn(process.execPath, [resolve(standalone,'server.js')], {
  cwd:project, stdio:'inherit', env:{ ...process.env, NODE_ENV:'production', PORT:process.env.PORT || '3017', HOSTNAME:process.env.HOSTNAME || '0.0.0.0', OMA_AUTH_DIR:resolve(project,process.env.OMA_AUTH_DIR || '.oma-auth') },
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode=1; });
child.on('exit', (code,signal) => { process.exitCode=code ?? (signal==='SIGINT'?130:1); });
