# Dependency audit — September 12, 2026

## Review snapshot

Before remediation, `npm audit --omit=dev` reported three high-severity dependency records, all from one chain: `@cloudflare/puppeteer@1.4.0 → @puppeteer/browsers@2.2.4 → extract-zip@2.0.1`. The full audit reported six records because the unused `cf@0.10.0` development CLI also installed an older Miniflare with `sharp@0.35.2`. These counts include parent-package propagation; they are not six independent flaws.

## Extract-zip

Both [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) and [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) affect versions through 2.0.1 and list no patched release. Malicious archive symlinks can point or write outside the extraction destination.

The appropriate dependency change is above the extractor: Puppeteer's [browsers 3.0 release](https://github.com/puppeteer/puppeteer/releases/tag/browsers-v3.0.0) removed extract-zip ([upstream change](https://github.com/puppeteer/puppeteer/pull/14960)). Current `@puppeteer/browsers@3.2.2` has `modern-tar` and `yargs` dependencies, with no extract-zip dependency.

Compatibility review:

- Keep `@cloudflare/puppeteer@1.4.0` and override only its `@puppeteer/browsers` dependency to 3.2.2. Do not accept the audit solver's suggested downgrade to Cloudflare Puppeteer 0.0.11.
- Browsers 3 is ESM-only and requires Node 22.12.0 or newer. The project engine and installer must reflect this lower bound.
- The symbols imported by Cloudflare's optional Node launcher helpers remain exported in 3.2.2: `launch`, executable-path helpers, timeout/endpoint constants, browser enums, build/platform helpers, installation helpers, `createProfile`, and `Cache`.
- A static traversal of the installed Cloudflare Workers entry point covered 115 relative JavaScript modules and found no imports of `@puppeteer/browsers`. The Browser Run `launch/connect` path used by oma.os does not use the archive downloader. This is a compatibility finding, not permission to ignore vulnerable dependencies.
- Node helper compatibility is not asserted for undocumented internals or obsolete Node releases. Build and Browser Run verification remain required after changing the lockfile.

## Development CLI / sharp

[GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) identifies unsafe libheif processing in sharp versions below 0.35.4. The installed Next.js, current Wrangler, and Cloudflare Vite plugin already resolve sharp 0.35.4. Only the extra `cf` CLI's older Miniflare pulled in 0.35.2.

The project uses Wrangler in its package scripts; the separate `cf` package was used for research and is not required to build, run, or deploy oma.os. Remove that development dependency instead of downgrading it or overriding unrelated runtime components. If a vulnerable sharp remains after removal, a targeted 0.35.4 patch override can be evaluated then.

## Verification status

Applied after the active browser test run stopped:

- Removed the unused `cf` development dependency.
- Added a scoped `@cloudflare/puppeteer → @puppeteer/browsers: 3.2.2` override and regenerated the lockfile.
- Updated the project engine, installer check, and README to Node 22.12 or newer.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Full `npm audit`: **0 vulnerabilities**. No sharp override was necessary after removing cf.
- TypeScript check passed.
- Node 24 API smoke check passed for Cloudflare `launch/connect`, its legacy `ProductLauncher` import, CommonJS loading of the overridden ESM package, and `computeExecutablePath`.

The install removed 69 packages and added 14. Current Next.js and Cloudflare tooling share sharp 0.35.4. The main build/deployment verification records the final Cloudflare compilation and actual Browser Run smoke check separately; these read/import checks do not claim to have launched a remote browser. A zero audit count alone does not establish runtime compatibility.
