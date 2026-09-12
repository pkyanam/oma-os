import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import { Worker } from "node:worker_threads";
function templateCore(name: string) {
  const html = readFileSync(
    new URL(`../../public/templates/${name}.html`, import.meta.url),
    "utf8",
  );
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "Inline script exists");
  new Script(script);
  assert.equal(
    /<script[^>]+src=|<link[^>]+href=["']https?:/i.test(html),
    false,
    "No remote code/assets",
  );
  return script.slice(0, script.indexOf("const $"));
}
function run(name: string, expression: string) {
  return new Script(templateCore(name) + "\n" + expression).runInContext(
    createContext({}),
  );
}
test("Pulse pattern validates dimensions and swing preserves paired-step timing", () => {
  assert.equal(
    run("pulse", "stepDuration(120,40,0)+stepDuration(120,40,1)"),
    0.25,
  );
  assert.throws(
    () => run("pulse", `validatePattern({version:1,steps:[]})`),
    /8 × 16/,
  );
  assert.equal(
    run(
      "pulse",
      `validatePattern({version:1,steps:Array.from({length:8},()=>Array(16).fill(false)),bpm:120,scale:'minor',voice:'sine',swing:99}).swing`,
    ),
    45,
  );
});
test("Image Studio pixel transforms preserve alpha and identity, and grayscale uses luminance", () => {
  assert.equal(
    run(
      "image-studio",
      `JSON.stringify(Array.from(adjustPixels(new Uint8ClampedArray([255,20,0,128]),1,1,1)))`,
    ),
    "[255,20,0,128]",
  );
  assert.equal(
    run(
      "image-studio",
      `JSON.stringify(Array.from(adjustPixels(new Uint8ClampedArray([255,0,0,100]),1,1,0)))`,
    ),
    "[54,54,54,100]",
  );
  assert.throws(() => run("image-studio", "validSize(4096,4096)"), /8 million/);
  assert.equal(
    run(
      "image-studio",
      `JSON.stringify(dominantColors(new Uint8ClampedArray([255,0,0,255,0,255,0,0])))`,
    ),
    '["#ff0000"]',
  );
});
test("Regex Lab replacement agrees with native JavaScript for captures and special tokens", () => {
  const cases = [
    {
      pattern: "(?<word>[a-z]+)",
      flags: "g",
      input: "one TWO two",
      replacement: "$<word>:$&:$$",
    },
    {
      pattern: "(a)(b)?",
      flags: "g",
      input: "a ab",
      replacement: "$2-$1-$12-$99",
    },
    { pattern: "b", flags: "", input: "abc", replacement: "$`/$&/$'" },
    { pattern: "\\b", flags: "g", input: "a b", replacement: "|" },
    { pattern: "(?:)", flags: "gu", input: "😀x", replacement: "_" },
    { pattern: "nomatch", flags: "g", input: "text", replacement: "x" },
  ];
  for (const value of cases) {
    const actual = run(
      "regex-lab",
      `evaluateRegex(${JSON.stringify(value)}).output`,
    );
    assert.equal(
      actual,
      value.input.replace(
        new RegExp(value.pattern, value.flags),
        value.replacement,
      ),
    );
  }
  assert.throws(
    () =>
      run(
        "regex-lab",
        `evaluateRegex({pattern:'[',flags:'g',input:'a',replacement:''})`,
      ),
    /regular expression/i,
  );
  assert.throws(
    () =>
      run(
        "regex-lab",
        `evaluateRegex({pattern:'a',flags:'g',input:'a'.repeat(1001),replacement:''})`,
      ),
    /1,000/,
  );
});
test("Catastrophic regex runs off-thread and can be terminated without blocking the caller", async () => {
  const worker = new Worker(
    `const {parentPort}=require('node:worker_threads');${templateCore("regex-lab")};parentPort.postMessage('ready');parentPort.on('message',data=>parentPort.postMessage(evaluateRegex(data)));`,
    { eval: true },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      worker.once("message", () => resolve());
      worker.once("error", reject);
    });
    let replied = false;
    worker.once("message", () => {
      replied = true;
    });
    worker.postMessage({
      pattern: "(a+)+$",
      flags: "",
      input: "a".repeat(40) + "!",
      replacement: "",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      replied,
      false,
      "Catastrophic pattern is still running when the deadline fires",
    );
    const exit = await worker.terminate();
    assert.equal(typeof exit, "number");
  } finally {
    await worker.terminate();
  }
});
