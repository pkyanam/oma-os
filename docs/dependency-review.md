# Dependency security review

Reviewed September 12, 2026 against the installed dependency tree, published package artifacts, `npm audit --json`, and upstream advisories. A clean package audit is not proof that copied or prebundled JavaScript is patched.

## Recommended resolutions

| Dependency / consumer               |  Installed at review start | Resolution                                                                             | Compatibility evidence                                                                                                                                                                                         |
| ----------------------------------- | -------------------------: | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| nanoid / Excalidraw                 |                      3.3.3 | Scoped override to 3.3.18                                                              | Excalidraw 0.18.1 production chunks import named `nanoid` externally; development artifacts call only `nanoid()` and `nanoid(40)`. Remain on the maintained 3.x line.                                          |
| nanoid / mermaid-to-excalidraw      |                      4.0.2 | Scoped override to 5.1.16                                                              | Converter 2.2.2 imports named `nanoid` externally and calls `nanoid()` with no arguments. The same ESM export exists in 5.x; supported Node is `^18                                                            |     | >=20`, satisfied by the project's Node requirement. This is a deliberate scoped major override and still requires Mermaid conversion smoke testing. |
| lodash-es / Chevrotain parser chain |             vulnerable 4.x | Override to 4.18.1                                                                     | Registry current release is 4.18.1. The affected APIs are `template`, `unset`, and `omit`; parser dependencies import lodash-es externally, so the override reaches bundled application code. Stay in major 4. |
| DOMPurify / package dependency      |                      3.4.8 | Override to 3.4.15                                                                     | Maintained 3.x patch release covers the current advisory range. This fixes external consumers only.                                                                                                            |
| DOMPurify / Monaco vendored code    | 3.4.8 inside Monaco 0.56.0 | Replace the complete vendored sanitizer implementation or change editor build strategy | **Package overrides alone do not fix this artifact.** Monaco's current latest stable npm release at review time is still 0.56.0.                                                                               |

Do not accept npm's suggested Monaco 0.53.0 or Excalidraw 0.17.6 downgrade automatically. Those are dependency-graph suggestions, not validation that the older application's shipped code is safer or compatible.

## Nano ID: impact and primary evidence

The advisories cover non-integer sizes, negative sizes, zero-size custom generators and integer overflow. [Upstream advisory database](https://github.com/advisories/GHSA-mwcw-c2x4-8c55), [negative-size advisory](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [zero-size advisory](https://github.com/advisories/GHSA-2v37-7h3g-55p8), [integer-overflow advisory](https://github.com/advisories/GHSA-xwg4-73v4-xw9w).

The reviewed Excalidraw and Mermaid conversion call sites do not expose a user-controlled generator size, custom alphabet or non-secure generator. These IDs identify drawing elements; oma.os authentication/session IDs use Node cryptographic randomness, not these dependencies. That narrows the demonstrated reachability here, but does not justify leaving known vulnerable versions installed. [Nano ID 3.3.18 release](https://github.com/ai/nanoid/releases/tag/3.3.18), [5.1.16 release](https://github.com/ai/nanoid/releases/tag/5.1.16).

## Lodash: impact and primary evidence

The current findings include code injection when an attacker controls `template` import-key names, and prototype pollution through array paths in `unset`/`omit`. oma.os does not directly call these APIs. The parser's full transitive code surface was not proven unreachable, so the recommendation is to patch the package rather than label the finding harmless. [Template advisory](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [unset/omit advisory](https://github.com/advisories/GHSA-f23m-r3pf-42rh), [lodash source](https://github.com/lodash/lodash).

## Monaco: copied assets need their own remediation

`monaco-editor@0.56.0` has both a declared `dompurify: 3.4.8` dependency and a full vendored DOMPurify implementation at `esm/vs/base/browser/dompurify/dompurify.js`. The minified AMD build includes that implementation in `min/vs/editor-KLE6jdfb.js`. `scripts/prepare-assets.mjs` copies the entire min tree to `public/monaco/vs`, and Editor loads that AMD tree. Merely replacing `node_modules/dompurify` changes neither code path. The same problem is documented in [upstream Monaco issue 5454](https://github.com/microsoft/monaco-editor/issues/5454).

The reviewed Monaco sanitizer wrapper installs attribute/protocol hooks and passes string HTML with `RETURN_DOM_FRAGMENT` or `RETURN_TRUSTED_TYPE`. It does not configure `IN_PLACE`, `CUSTOM_ELEMENT_HANDLING`, `setConfig()` or `clearConfig()`, which are prerequisites for the four current findings. No input-only exploit against this Monaco integration was demonstrated. This is a reachability assessment, not a blanket safety claim. [IN_PLACE advisory](https://github.com/cure53/DOMPurify/security/advisories/GHSA-55q2-fjhq-7xh7), [setConfig pollution advisory](https://github.com/cure53/DOMPurify/security/advisories/GHSA-cmwh-pvxp-8882), [DOMPurify 3.4.15 release](https://github.com/cure53/DOMPurify/releases/tag/3.4.15).

A defensible targeted patch must replace the entire sanitizer factory with the official patched implementation, preserve its license, check the exact original bundle hash, fail closed when upstream bundle contents change, and verify that the final copied assets contain the patched version. A blind regex edit of a version string or individual vulnerability line is not a remediation. Alternatively, migrate Monaco to an ESM bundle with an explicit alias for its vendored DOMPurify module and rebuilt workers; this is a broader editor integration change.

Original reviewed AMD bundle SHA-256: `242e91c0d4f8ee2c061830e1a0060f2d51889ec22dc236b45f15ee3b6cde3ed3`. Its AST identifies the sanitizer as function `nR`, containing the assignment of version `3.4.8`. This fingerprint is specific to Monaco 0.56.0, not a future-proof search rule.

## Required verification after applying changes

- Inspect `npm ls nanoid lodash-es dompurify` and rerun `npm audit`.
- Inspect copied `public/monaco` independently of package metadata.
- Build/typecheck/test the app; open Monaco and verify editing, completion hover sanitization and a real file save.
- Open Excalidraw, create/serialize/reload a drawing, and convert a Mermaid diagram if that feature is enabled.
- Report any remaining bundled finding explicitly. Do not claim audit-clean based only on overrides.

## Implemented artifact patch

`scripts/patch-monaco-security.mjs` exports `patchMonacoSecurity()` for the asset preparation step. It reads pristine Monaco assets, verifies both package versions and complete SHA-256 fingerprints, parses the AMD bundle with Acorn, and replaces the one reviewed DOMPurify factory with a private-scope copy of the official 3.4.15 ESM implementation. It removes only the module export and obsolete source-map directive through parsed ranges, preserving licensing. The wrapper preserves both the default instance and explicit-window factory behavior. The entire output is parsed again before writing, and a provenance JSON records source and output fingerprints.

Three unit tests verify the old and new factory versions/exports without executing the Monaco bundle, rejection of changed source bytes, and deterministic preparation without modifying node_modules. Integration must call this function **after** copying pristine Monaco AMD assets; a later raw copy would undo the fix. The unchanged Monaco package in node_modules still contains its original vendored ESM sanitizer, so an ESM-editor migration must explicitly revisit this patch.
