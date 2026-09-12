import { test } from "node:test";
import assert from "node:assert/strict";
import { documentHTML } from "./document";
import { publicAddress, remoteURL, fetchPage } from "./fetch";
import { readLibrary, visitPage, snapshotName } from "./library";
test("gateway blocks loopback, private, multicast and mapped IPv6 addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.2",
    "172.16.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});
test("gateway URL policy rejects credentials, custom ports, and other protocols", () => {
  for (const value of [
    "file:///etc/passwd",
    "http://user:password@example.com",
    "https://example.com:8443/",
    "ftp://example.com",
  ])
    assert.throws(() => remoteURL(value));
  assert.equal(remoteURL("https://example.com/path").hostname, "example.com");
});
test("gateway rejects private literals before making a request", async () => {
  await assert.rejects(fetchPage("http://127.0.0.1/"), /Private and local/);
  await assert.rejects(fetchPage("http://[::1]/"), /Private and local/);
});
test("documents strip remote executable surfaces and install nonce-limited CSP", () => {
  const output = documentHTML(
    '<script src="https://evil.test/x.js"></script><img onerror="alert(1)" src="/a.png"><iframe src="https://evil.test"></iframe><object data="x"></object><meta http-equiv="refresh" content="0;url=https://evil.test"><a href="javascript:alert(1)">Bad</a>',
    "https://example.com/page",
  );
  assert.doesNotMatch(
    output,
    /onerror|evil\.test|http-equiv="refresh"|javascript:/,
  );
  assert.match(output, /script-src 'nonce-/);
  assert.match(output, /form-action 'none'/);
  assert.match(output, /src="https:\/\/example.com\/a.png"/);
  const scripts = [...output.matchAll(/<script([^>]*)>/g)];
  assert.equal(scripts.length, 2);
  assert.ok(scripts.every((s) => s[1].includes("nonce=")));
});
test("documents retain public links and GET forms but disable password entry", () => {
  const output = documentHTML(
    '<a href="../other" target="_blank">Go</a><form action="/search"><input name="q"><input type="password" name="secret"></form>',
    "https://example.com/docs/page",
  );
  assert.match(output, /href="https:\/\/example.com\/other"/);
  assert.match(output, /action="https:\/\/example.com\/search"/);
  assert.doesNotMatch(output, /name="secret"/);
  assert.match(output, /disabled/);
  assert.match(output, /newTab:/);
  assert.match(output, /searchParams.append/);
});
test("document bridge base cannot inject a script", () => {
  const output = documentHTML(
    "<p>Safe</p>",
    "https://example.com/?q=</script><script>evil()</script>",
  );
  assert.doesNotMatch(output, /<script>evil/);
});
test("browser library tolerates corruption and rejects executable persisted addresses", () => {
  assert.deepEqual(readLibrary("{bad"), { bookmarks: [], history: [] });
  assert.deepEqual(
    readLibrary(
      JSON.stringify({
        bookmarks: [{ url: "javascript:alert(1)", title: "bad", visited: 1 }],
        history: "bad",
      }),
    ),
    { bookmarks: [], history: [] },
  );
});
test("history deduplicates and caps retained pages", () => {
  let rows: ReturnType<typeof visitPage> = [];
  for (let i = 0; i < 230; i++)
    rows = visitPage(rows, {
      url: "https://example.com/" + i,
      title: String(i),
      visited: i,
    });
  assert.equal(rows.length, 200);
  rows = visitPage(rows, {
    url: "https://example.com/229",
    title: "Again",
    visited: 999,
  });
  assert.equal(rows.length, 200);
  assert.equal(rows[0].title, "Again");
});
test("saved page names cannot escape Downloads", () => {
  assert.equal(
    snapshotName("https://example.com/a?x=1", 123),
    "example.com-123.html",
  );
  assert.doesNotMatch(snapshotName("/home/guest/../../foo.html", 1), /[\/\\]/);
});

test("browser tab restore rejects malformed sessions and duplicate IDs", async () => {
  const { readTabs } = await import("./library");
  assert.equal(readTabs("broken").tabs[0].initial, "oma:start");
  const value = readTabs(
    JSON.stringify({
      selected: "missing",
      tabs: [
        { id: "a", initial: "https://example.com/", title: "Example" },
        { id: "a", initial: "https://evil.test/", title: "Duplicate" },
        { id: "b", initial: "javascript:alert(1)", title: "Unsafe" },
      ],
    }),
  );
  assert.equal(value.tabs.length, 1);
  assert.equal(value.selected, "a");
});
