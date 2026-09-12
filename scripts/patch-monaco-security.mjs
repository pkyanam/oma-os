/**
 * Monaco 0.56.0 embeds DOMPurify 3.4.8 in its AMD distribution. Package
 * overrides do not replace that code. Replace the complete factory with the
 * official pinned DOMPurify source; never patch individual security checks.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";
export const MONACO_VERSION = "0.56.0";
export const PURIFY_VERSION = "3.4.15";
export const MONACO_BUNDLE = "editor-KLE6jdfb.js";
export const MONACO_SHA256 =
  "242e91c0d4f8ee2c061830e1a0060f2d51889ec22dc236b45f15ee3b6cde3ed3";
export const PURIFY_SHA256 =
  "e7d8182ea0aae9daa46c3294a486067b3f4461bd18f8ca76e499c623e9bda6e3";
const root = fileURLToPath(new URL("../", import.meta.url));
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
function walk(node, visit, ancestors = []) {
  if (!node || typeof node !== "object" || typeof node.type !== "string")
    return;
  visit(node, ancestors);
  for (const value of Object.values(node)) {
    if (Array.isArray(value))
      for (const child of value) walk(child, visit, [...ancestors, node]);
    else if (value && typeof value === "object")
      walk(value, visit, [...ancestors, node]);
  }
}
/** Pure transformation: parsing only, no third-party bundle execution. */
export function patchMonacoBundle(bundle, purifier) {
  if (sha256(bundle) !== MONACO_SHA256)
    throw new Error(
      "Monaco bundle fingerprint changed. Review the upstream release before updating this security patch.",
    );
  if (sha256(purifier) !== PURIFY_SHA256)
    throw new Error(
      "DOMPurify source fingerprint changed. Expected official 3.4.15 purify.es.mjs.",
    );
  const tree = parse(bundle, { ecmaVersion: "latest", sourceType: "script" });
  const factories = [];
  walk(tree, (node, ancestors) => {
    if (node.type === "Literal" && node.value === "3.4.8") {
      const factory = [...ancestors]
        .reverse()
        .find((parent) => parent.type === "FunctionDeclaration");
      if (factory && !factories.includes(factory)) factories.push(factory);
    }
  });
  if (factories.length !== 1 || factories[0].id?.name !== "nR")
    throw new Error("Expected exactly one reviewed Monaco DOMPurify factory.");
  const factory = factories[0];
  const comments = [];
  const source = parse(purifier, {
    ecmaVersion: "latest",
    sourceType: "module",
    onComment: comments,
  });
  const exports = source.body.filter((node) => node.type.startsWith("Export"));
  if (
    source.body.some((node) => node.type === "ImportDeclaration") ||
    exports.length !== 1
  )
    throw new Error("DOMPurify must be a self-contained source module.");
  const exported = exports[0];
  if (
    exported.type !== "ExportNamedDeclaration" ||
    exported.source ||
    exported.declaration ||
    exported.specifiers.length !== 1 ||
    exported.specifiers[0].local.name !== "purify" ||
    exported.specifiers[0].exported.name !== "default"
  )
    throw new Error("Unexpected DOMPurify export contract.");
  const instance = source.body
    .flatMap((node) =>
      node.type === "VariableDeclaration" ? node.declarations : [],
    )
    .find((node) => node.id?.name === "purify");
  if (
    instance?.init?.type !== "CallExpression" ||
    instance.init.callee.name !== "createDOMPurify"
  )
    throw new Error("Expected the official DOMPurify default instance.");
  // Keep the complete upstream implementation and license in a private function
  // scope. Zero arguments return its default instance; explicit windows create
  // a fresh instance exactly as the original factory did.
  const removedRanges = [
    exported,
    ...comments.filter((comment) =>
      comment.value.trim().startsWith("# sourceMappingURL="),
    ),
  ];
  let implementation = purifier;
  for (const range of removedRanges.sort((a, b) => b.start - a.start))
    implementation =
      implementation.slice(0, range.start) + implementation.slice(range.end);
  const replacement = `function ${factory.id.name}(){\n${implementation}\nreturn arguments.length ? createDOMPurify(...arguments) : purify;\n}`;
  const output =
    bundle.slice(0, factory.start) + replacement + bundle.slice(factory.end);
  parse(output, { ecmaVersion: "latest", sourceType: "script" });
  if (output.includes("3.4.8") || !output.includes("DOMPurify 3.4.15"))
    throw new Error("Patched sanitizer version verification failed.");
  return {
    output,
    oldFactory: bundle.slice(factory.start, factory.end),
    newFactory: replacement,
    sha256: sha256(output),
  };
}
/** Called after prepare-assets copies pristine AMD assets. */
export async function patchMonacoSecurity({
  projectRoot = root,
  outputDirectory = resolve(projectRoot, "public/monaco/vs"),
} = {}) {
  const monacoRoot = resolve(projectRoot, "node_modules/monaco-editor");
  const purifierRoot = resolve(projectRoot, "node_modules/dompurify");
  const [monacoPackage, purifyPackage, bundle, purifier] = await Promise.all([
    readFile(resolve(monacoRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(resolve(purifierRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(resolve(monacoRoot, "min/vs", MONACO_BUNDLE), "utf8"),
    readFile(resolve(purifierRoot, "dist/purify.es.mjs"), "utf8"),
  ]);
  if (
    monacoPackage.version !== MONACO_VERSION ||
    purifyPackage.version !== PURIFY_VERSION
  )
    throw new Error(
      `Reviewed security patch requires monaco-editor ${MONACO_VERSION} and dompurify ${PURIFY_VERSION}.`,
    );
  const patched = patchMonacoBundle(bundle, purifier);
  const target = resolve(outputDirectory, MONACO_BUNDLE);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, patched.output);
  await writeFile(
    resolve(outputDirectory, "oma-security-patch.json"),
    JSON.stringify(
      {
        monaco: MONACO_VERSION,
        dompurify: PURIFY_VERSION,
        sourceSHA256: MONACO_SHA256,
        dompurifySHA256: PURIFY_SHA256,
        outputSHA256: patched.sha256,
      },
      null,
      2,
    ) + "\n",
  );
  return { path: target, sha256: patched.sha256 };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  patchMonacoSecurity()
    .then(() => {
      console.log(
        `Patched Monaco ${MONACO_VERSION} with DOMPurify ${PURIFY_VERSION}.`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
