# Third-party notices

oma.os source is MIT licensed. Third-party software, fonts, runtimes and assets retain their original licenses. This inventory records direct runtime dependencies in the lockfile reviewed September 12, 2026; transitive dependency licenses remain in their packages and generated license headers. It does not relicense them under oma.os's MIT license.

## Embedded applications and copied assets

| Component                                                   | Version / source                                        | License and preserved notice                                                                                                                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Excalidraw](https://github.com/excalidraw/excalidraw)      | `@excalidraw/excalidraw` 0.18.1                         | MIT, copyright Excalidraw; [license](public/licenses/excalidraw.txt)                                                                                                                                                                    |
| [PGlite](https://github.com/electric-sql/pglite)            | `@electric-sql/pglite` 0.5.8                            | Apache-2.0; [license](public/licenses/pglite.txt)                                                                                                                                                                                       |
| [PostgreSQL](https://www.postgresql.org/about/licence/)     | Runtime included by PGlite                              | PostgreSQL License; [copied runtime notice](public/licenses/postgresql.txt)                                                                                                                                                             |
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | 0.56.0                                                  | MIT, copyright Microsoft Corporation; [license](public/licenses/monaco.txt)                                                                                                                                                             |
| [DOMPurify](https://github.com/cure53/DOMPurify)            | 3.4.15 supplied to the checked Monaco patch             | Dual MPL-2.0 or Apache-2.0; distributed here under the [Apache-2.0 option](public/licenses/dompurify-apache.txt). Upstream copyright and license header remain in patched code.                                                         |
| [Just Bash](https://github.com/vercel-labs/just-bash)       | 3.4.2                                                   | Apache-2.0; [license](public/licenses/just-bash.txt)                                                                                                                                                                                    |
| [Playwright](https://github.com/microsoft/playwright)       | 1.63.0                                                  | Apache-2.0, copyright Microsoft Corporation; [license](docker/PLAYWRIGHT-LICENSE), [NOTICE](docker/PLAYWRIGHT-NOTICE)                                                                                                                   |
| [Pyodide](https://github.com/pyodide/pyodide)               | 314.0.6, fetched by Python Lab from its pinned CDN path | MPL-2.0 for Pyodide; [upstream versioned license](https://github.com/pyodide/pyodide/blob/314.0.6/LICENSE). CPython and optional Python packages retain their own licenses. The runtime is downloaded, not copied into this repository. |

PGlite's WASM and runtime files, Excalidraw fonts, and Monaco AMD files are copied into `public/` by the asset preparation script. Their licenses must remain with redistributed builds. Excalidraw integration is the upstream open-source application, not code copied from the hosted ryOS project.

`docker/seccomp_profile.json` is an unchanged copy of [Playwright v1.63.0's profile](https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/seccomp_profile.json). Playwright describes it as Docker's default seccomp policy with additional user-namespace permissions. The copied Playwright license and NOTICE accompany it. The bundled Chromium executable is installed from Playwright during setup/container build and includes Chromium's own third-party notices; its license is not replaced by Playwright's Apache license.

## Fonts and icons

| Asset                  | License / notice                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Inter                  | SIL Open Font License 1.1; [license and copyright](public/fonts/Inter-LICENSE.txt)                                  |
| JetBrains Mono         | SIL Open Font License 1.1; [license and copyright](public/fonts/JetBrainsMono-LICENSE.txt)                          |
| Excalidraw font assets | Family-specific notices extracted from upstream font metadata; [font notices](public/licenses/excalidraw-fonts.txt) |
| Lucide React 0.577.0   | ISC; [upstream license](https://github.com/lucide-icons/lucide/blob/main/LICENSE)                                   |

## Other direct runtime dependencies

| Package                                                 | Reviewed version | License    | Upstream                                                                            |
| ------------------------------------------------------- | ---------------- | ---------- | ----------------------------------------------------------------------------------- |
| Next.js                                                 | 16.3.5           | MIT        | [vercel/next.js](https://github.com/vercel/next.js)                                 |
| React / React DOM                                       | 19.3.0           | MIT        | [facebook/react](https://github.com/facebook/react)                                 |
| Zustand                                                 | 5.0.15           | MIT        | [pmndrs/zustand](https://github.com/pmndrs/zustand)                                 |
| `@monaco-editor/react`                                  | 4.7.0            | MIT        | [suren-atoyan/monaco-react](https://github.com/suren-atoyan/monaco-react)           |
| `@xterm/xterm`                                          | 6.0.0            | MIT        | [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)                             |
| `@xterm/addon-fit` / `@xterm/addon-webgl`               | 0.11.0 / 0.19.0  | MIT        | [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)                             |
| `ai` / `@ai-sdk/openai`                                 | 7.0.99 / 4.0.66  | Apache-2.0 | [vercel/ai](https://github.com/vercel/ai)                                           |
| `@opencoredev/loginwithchatgpt-ai`, `-react`, `-server` | 0.2.0            | MIT        | [opencoredev/login-with-chatgpt](https://github.com/opencoredev/login-with-chatgpt) |
| Acorn                                                   | 8.18.0           | MIT        | [acornjs/acorn](https://github.com/acornjs/acorn)                                   |
| fflate                                                  | 0.8.3            | MIT        | [101arrowz/fflate](https://github.com/101arrowz/fflate)                             |
| ipaddr.js                                               | 2.5.0            | MIT        | [whitequark/ipaddr.js](https://github.com/whitequark/ipaddr.js)                     |
| react-markdown                                          | 10.1.0           | MIT        | [remarkjs/react-markdown](https://github.com/remarkjs/react-markdown)               |
| remark-gfm                                              | 4.0.1            | MIT        | [remarkjs/remark-gfm](https://github.com/remarkjs/remark-gfm)                       |
| sanitize-html                                           | 2.17.7           | MIT        | [apostrophecms/sanitize-html](https://github.com/apostrophecms/sanitize-html)       |

Security overrides for transitive dependencies are recorded in `package.json` and the lockfile. The Monaco sanitizer replacement is original integration code around the complete licensed upstream DOMPurify implementation; its exact hashes and provenance are documented in [dependency review](docs/dependency-review.md).

## Project inspiration

Omarchy and ryOS informed product research and interaction ideas. oma.os is not affiliated with either project, and no AGPL ryOS implementation was incorporated. Trademarks and product names belong to their respective owners. The ChatGPT login adapter is a community project, not an official OpenAI SDK endorsement.
