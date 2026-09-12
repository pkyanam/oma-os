#!/usr/bin/env sh
set -eu
command -v git >/dev/null 2>&1 || { echo 'Install Git first.' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 22 or newer first: https://nodejs.org' >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo 'Node.js 22 or newer is required.' >&2; exit 1; }
oma_target=${OMA_INSTALL_DIR:-oma-os}
if [ -e "$oma_target" ]; then
  echo "Directory already exists: $oma_target. Choose a different OMA_INSTALL_DIR." >&2
  exit 1
fi
git clone https://github.com/pkyanam/oma-os.git "$oma_target"
cd "$oma_target"
npm ci
if [ "${OMA_SKIP_BROWSER:-0}" != "1" ]; then
  npm run setup:browser
fi
printf '\noma.os is ready at http://localhost:3017\nPress Ctrl+C to stop.\n\n'
exec npm run dev
