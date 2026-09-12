import test from "node:test";
import assert from "node:assert/strict";
import { saveConversationArchive } from "./archive";
import type { Conversation } from "./conversations";
const conversation: Conversation = {
  id: "test",
  title: "Test",
  updatedAt: 1,
  messages: [{ id: "1", role: "user", text: "Hello" }],
};
function backend() {
  let contents: string | undefined;
  return {
    get contents() {
      return contents;
    },
    set contents(value: string | undefined) {
      contents = value;
    },
    mkdir: async () => {},
    writeBlob: async (
      _path: string,
      blob: Blob,
      options?: { overwrite?: boolean },
    ) => {
      assert.equal(options?.overwrite, false);
      if (contents !== undefined) throw new Error("Already exists");
      contents = await blob.text();
    },
    write: async (_path: string, value: string, expected?: string) => {
      if (contents !== expected || contents === undefined)
        throw new Error("Archive changed");
      contents = value;
    },
  };
}
test("conversation archives are created atomically then saved against their last known contents", async () => {
  const disk = backend();
  const first = await saveConversationArchive(conversation, undefined, disk);
  const next = await saveConversationArchive(
    { ...conversation, updatedAt: 2 },
    first,
    disk,
  );
  assert.equal(disk.contents, next);
});
test("another tab changing a conversation prevents silent lost updates", async () => {
  const disk = backend(),
    baseline = await saveConversationArchive(conversation, undefined, disk);
  disk.contents = "new version from another tab";
  await assert.rejects(
    saveConversationArchive(conversation, baseline, disk),
    /changed/,
  );
  assert.equal(disk.contents, "new version from another tab");
});
test("deleted conversation archives are not silently resurrected", async () => {
  const disk = backend(),
    baseline = await saveConversationArchive(conversation, undefined, disk);
  disk.contents = undefined;
  await assert.rejects(
    saveConversationArchive(conversation, baseline, disk),
    /changed/,
  );
  assert.equal(disk.contents, undefined);
});
