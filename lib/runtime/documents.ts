import { fs, normalize } from "../fs/opfs";
export function runtimeDocumentPath(input: string) {
  if (!input.trim() || input.trim().endsWith("/"))
    throw new Error("Enter a file path, including its filename.");
  const path = normalize(input.trim());
  if (!path.startsWith("/home/guest/") && !path.startsWith("/.oma/"))
    throw new Error("Choose a file inside /home/guest or /.oma.");
  return path;
}
export async function saveRuntimeDocument({
  path,
  content,
  expected,
  confirmReplace,
  storage = fs,
}: {
  path: string;
  content: string;
  expected?: string;
  confirmReplace: (path: string) => boolean | Promise<boolean>;
  storage?: Pick<typeof fs, "read" | "write" | "writeBlob">;
}) {
  const target = runtimeDocumentPath(path);
  let baseline = expected;
  if (baseline === undefined) {
    try {
      baseline = await storage.read(target);
      if (!(await confirmReplace(target))) return null;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError"))
        throw error;
      await storage.writeBlob(
        target,
        new Blob([content], { type: "text/plain;charset=utf-8" }),
        { overwrite: false },
      );
      return target;
    }
  }
  await storage.write(target, content, baseline);
  return target;
}
