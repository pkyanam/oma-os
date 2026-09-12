import { fs } from './opfs';
export const SKILL = "# oma.os skill\n\nYou are operating oma.os, a browser desktop inspired by Omarchy Linux.\nYou are a user of the machine. Prefer the command bus to clicking.\n\n## Rules\n- Mutate state only through `oma \u2026` commands.\n- Do not wipe /home without `oma reset --yes`.\n- Theme IDs are slugs from `oma theme list`.\n- Workspaces are 1\u20139. Tiling is a binary tree. There are no titlebars.\n- Files live in Origin Private File System. Paths start at /home/guest or /.oma.\n\n## Useful commands\n- oma help\n- oma launch term|files|editor|agent\n- oma ws N\n- oma theme set tokyo-night\n- oma fs ls /home/guest\n- oma fs read PATH\n- oma fs write PATH\n\n## Constraints\n- There is no package manager and no root.\n- There is no network from the guest. The page itself may call /api/*.\n- If a model is not configured, say so. Do not invent command output.\n";
async function seedFiles(){
  for(const p of ['/home/guest/Projects','/home/guest/Documents','/.oma'])await fs.mkdir(p);
  if(!await fs.exists('/.oma/SKILL.md'))await fs.write('/.oma/SKILL.md',SKILL);
  if(!await fs.exists('/.oma/config.toml'))await fs.write('/.oma/config.toml','theme = \"tokyo-night\"\ndefault_agent = \"none\"\nbar.clock = \"local\"\n');
}

export async function seed(){if(navigator.locks)return navigator.locks.request('oma-os-seed',seedFiles);return seedFiles();}
