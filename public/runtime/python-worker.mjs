// Pinned runtime. Executed only after the user chooses Run in Python Lab.
const INDEX = "https://cdn.jsdelivr.net/pyodide/v314.0.6/full/";
let runtime;
let running = false;
let outputSize = 0;
function send(type, text) {
  if (type === "stdout" || type === "stderr") {
    if (outputSize > 100000) return;
    outputSize += text.length;
    text = text.slice(0, 100000);
  }
  self.postMessage({ type, text });
}
self.onmessage = async ({ data }) => {
  if (running || data.type !== "run") return;
  running = true;
  outputSize = 0;
  try {
    if (!runtime) {
      send("status", "Downloading Python runtime…");
      const { loadPyodide } = await import(INDEX + "pyodide.mjs");
      runtime = await loadPyodide({
        indexURL: INDEX,
        stdout: (text) => send("stdout", text),
        stderr: (text) => send("stderr", text),
      });
      runtime.FS.mkdirTree("/work");
      runtime.FS.chdir("/work");
    }
    runtime.setStdin({ stdin: () => null });
    for (const file of data.files || []) {
      if (
        typeof file.name !== "string" ||
        !file.name ||
        /[\/\\\0]/.test(file.name) ||
        file.name === "." ||
        file.name === ".."
      )
        throw new Error("Invalid import filename.");
      if (typeof file.content !== "string" || file.content.length > 1000000)
        throw new Error("Import supports text up to 1 MB.");
      runtime.FS.writeFile("/work/" + file.name, file.content);
    }
    send("status", "Loading imports…");
    await runtime.loadPackagesFromImports(data.code, {
      messageCallback: (text) => send("status", text),
      errorCallback: (text) => send("stderr", text),
    });
    send("status", "Running…");
    const start = performance.now();
    const result = await runtime.runPythonAsync(data.code);
    if (result !== undefined) {
      send("stdout", String(result));
      result?.destroy?.();
    }
    const files = [];
    for (const name of runtime.FS.readdir("/work")) {
      if (name === "." || name === "..") continue;
      const stat = runtime.FS.stat("/work/" + name);
      if (runtime.FS.isFile(stat.mode) && stat.size <= 1000000)
        files.push({ name, size: stat.size });
    }
    self.postMessage({
      type: "done",
      elapsed: performance.now() - start,
      files,
    });
  } catch (error) {
    send("error", String(error));
  } finally {
    running = false;
  }
};
// Every read request receives a response, including busy/invalid requests.
self.addEventListener("message", ({ data }) => {
  if (data.type !== "read") return;
  try {
    if (!runtime)
      throw new Error("Python is not initialized. Run a script first.");
    if (running)
      throw new Error(
        "Python is running. Wait for it to finish before exporting.",
      );
    if (
      typeof data.name !== "string" ||
      !data.name ||
      /[\/\\\0]/.test(data.name) ||
      data.name === "." ||
      data.name === ".."
    )
      throw new Error("Invalid export filename.");
    const stat = runtime.FS.stat("/work/" + data.name);
    if (!runtime.FS.isFile(stat.mode) || stat.size > 1000000)
      throw new Error("Export supports files up to 1 MB.");
    const content = runtime.FS.readFile("/work/" + data.name, {
      encoding: "utf8",
    });
    self.postMessage({ type: "file", name: data.name, content });
  } catch (error) {
    self.postMessage({ type: "read-error", text: String(error) });
  }
});
