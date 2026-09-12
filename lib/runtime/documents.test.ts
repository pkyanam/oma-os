import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeDocumentPath, saveRuntimeDocument } from "./documents";
test("runtime documents normalize home paths and reject roots/escapes", () => {
  assert.equal(
    runtimeDocumentPath("Documents/report.csv"),
    "/home/guest/Documents/report.csv",
  );
  assert.throws(
    () => runtimeDocumentPath("/home/guest/../../secret"),
    /inside/,
  );
  assert.throws(() => runtimeDocumentPath("/home/guest/"), /filename/);
  assert.throws(() => runtimeDocumentPath(""), /filename/);
});
test("save as prompts once and guards against concurrent external writes", async () => {
  let content = "old";
  let prompts = 0;
  const storage = {
    read: async () => content,
    writeBlob: async () => {
      throw new Error("Existing file must not be created");
    },
    write: async (_p: string, next: string, expected?: string) => {
      assert.equal(expected, content);
      content = next;
    },
  };
  await saveRuntimeDocument({
    path: "test.py",
    content: "new",
    storage,
    confirmReplace: () => {
      prompts++;
      return true;
    },
  });
  assert.equal(content, "new");
  assert.equal(prompts, 1);
  await assert.rejects(
    saveRuntimeDocument({
      path: "test.py",
      content: "overwrite",
      expected: "old",
      storage,
      confirmReplace: () => true,
    }),
  );
  assert.equal(content, "new");
});
test("declining overwrite never writes and creation uses exclusive atomic create", async () => {
  let writes = 0;
  const declined = await saveRuntimeDocument({
    path: "test.csv",
    content: "new",
    storage: {
      read: async () => "old",
      writeBlob: async () => {
        throw new Error("Should not create");
      },
      write: async () => {
        writes++;
      },
    },
    confirmReplace: () => false,
  });
  assert.equal(declined, null);
  assert.equal(writes, 0);
  await saveRuntimeDocument({
    path: "new.csv",
    content: "new",
    storage: {
      read: async () => {
        throw new DOMException("missing", "NotFoundError");
      },
      write: async () => {
        throw new Error("Missing file must use atomic create");
      },
      writeBlob: async (_p, blob, options) => {
        assert.equal(options?.overwrite, false);
        assert.equal(await blob.text(), "new");
        writes++;
      },
    },
    confirmReplace: () => {
      throw new Error("Should not prompt");
    },
  });
  assert.equal(writes, 1);
});
test("racing creation rejects rather than overwriting a newly created file", async () => {
  const storage = {
    read: async () => {
      throw new DOMException("missing", "NotFoundError");
    },
    write: async () => {
      throw new Error("Unexpected overwrite");
    },
    writeBlob: async (
      _path: string,
      _body: Blob,
      options?: { overwrite?: boolean },
    ) => {
      assert.equal(options?.overwrite, false);
      throw new Error("A file already exists");
    },
  };
  await assert.rejects(
    saveRuntimeDocument({
      path: "race.py",
      content: "mine",
      storage,
      confirmReplace: () => true,
    }),
    /already exists/,
  );
});
