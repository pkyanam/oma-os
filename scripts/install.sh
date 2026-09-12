#!/usr/bin/env sh
set -eu
command -v git >/dev/null 2>&1 || { echo 'Install Git first.' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 22.12 or newer first: https://nodejs.org' >&2; exit 1; }
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<12))process.exit(1)' || { echo 'Node.js 22.12 or newer is required.' >&2; exit 1; }
oma_profile=${OMA_RUNTIME:-cloudflare}
case "$oma_profile" in cloudflare|node) ;; *) echo "OMA_RUNTIME must be cloudflare or node." >&2; exit 1 ;; esac
oma_target=${OMA_INSTALL_DIR:-oma-os}
if [ -e "$oma_target" ]; then
  echo "Directory already exists: $oma_target. Choose a different OMA_INSTALL_DIR." >&2
  exit 1
fi
git clone https://github.com/pkyanam/oma-os.git "$oma_target"
cd "$oma_target"
npm ci
if [ "$oma_profile" = "node" ]; then
  if [ "${OMA_SKIP_BROWSER:-0}" != "1" ]; then
    npm run setup:browser
  fi
  printf '\noma.os Node profile: http://localhost:3017\nPress Ctrl+C to stop.\n\n'
  exec npm run dev
fi
printf '\noma.os Cloudflare local profile: http://localhost:3018\nNo Cloudflare login required for local apps and auth. Managed remote browsing needs Cloudflare configuration.\nPress Ctrl+C to stop.\n\n'
exec npm run dev:cloudflare
