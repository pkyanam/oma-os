import { ARCHIVE_PATH, type Conversation } from "./conversations";
import type { fs } from "../fs/opfs";
type ArchiveBackend = Pick<typeof fs, "mkdir" | "write" | "writeBlob">;
/** Never replace an archive written by another tab since our last successful load/save. */
export async function saveConversationArchive(
  value: Conversation,
  expected: string | undefined,
  backend: ArchiveBackend,
) {
  const serialized = JSON.stringify(value);
  if (serialized.length > 3000000)
    throw new Error(
      "This conversation is too large to save. Export it and start a new conversation.",
    );
  const path = `${ARCHIVE_PATH}/${value.id}.json`;
  await backend.mkdir(ARCHIVE_PATH);
  if (expected === undefined)
    await backend.writeBlob(path, new Blob([serialized]), { overwrite: false });
  else await backend.write(path, serialized, expected);
  return serialized;
}
