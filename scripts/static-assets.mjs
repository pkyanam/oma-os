import { readFile, stat, mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { parse } from "acorn";
/** Trace the shipped runtime's literal JS/WASM/data references without executing it. */
export async function runtimeClosure(sourceDirectory, entrypoints) {
  const root = resolve(sourceDirectory),
    files = new Set(),
    pending = [...entrypoints];
  while (pending.length) {
    const item = pending.pop(),
      full = resolve(root, item),
      name = relative(root, full);
    if (name.startsWith("..") || isAbsolute(name))
      throw new Error("Runtime asset reference escaped its package: " + item);
    if (files.has(name)) continue;
    await stat(full);
    files.add(name);
    if (!name.endsWith(".js")) continue;
    const source = await readFile(full, "utf8"),
      tree = parse(source, { ecmaVersion: "latest", sourceType: "module" });
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      const reference = [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
        "ImportExpression",
      ].includes(node.type)
        ? node.source
        : node.type === "NewExpression" && node.callee?.name === "URL"
          ? node.arguments[0]
          : undefined;
      if (
        reference?.type === "Literal" &&
        typeof reference.value === "string" &&
        !isAbsolute(reference.value) &&
        /^(?:\.\.?\/)?[\w./-]+\.(?:js|wasm|data)$/.test(reference.value)
      ) {
        pending.push(relative(root, resolve(dirname(full), reference.value)));
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const child of value) visit(child);
        } else if (value && typeof value === "object") visit(value);
      }
    };
    visit(tree);
  }
  return [...files].sort();
}
export async function copyRuntimeClosure(
  sourceDirectory,
  destinationDirectory,
  entrypoints,
) {
  const files = await runtimeClosure(sourceDirectory, entrypoints);
  for (const file of files) {
    const target = resolve(destinationDirectory, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(sourceDirectory, file), target);
  }
  return files;
}
