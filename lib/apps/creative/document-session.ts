export type DocumentSnapshot<T> = {
  value: T;
  ready: boolean;
  status: string;
  error: string;
  dirty: boolean;
};
export type DocumentIO = {
  ensureParent(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  create(path: string, body: string, guard: () => void): Promise<void>;
  write(path: string, body: string, expected: string): Promise<void>;
  changed(): void;
};
const bootstraps = new Map<string, Promise<unknown>>();
/** Coordinates initialization even where the Web Locks API is unavailable. */
async function bootstrap<T>(path: string, work: () => Promise<T>): Promise<T> {
  const previous = bootstraps.get(path) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  bootstraps.set(path, next);
  try {
    return await next;
  } finally {
    if (bootstraps.get(path) === next) bootstraps.delete(path);
  }
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
/** Each mount/path owns its state. Disposed asynchronous operations cannot alter a new session. */
export class DocumentSession<T> {
  state: DocumentSnapshot<T>;
  private disk: string | undefined;
  private revision = 0;
  private readEpoch = 0;
  private active = true;
  private queue = Promise.resolve();
  constructor(
    readonly path: string,
    private createValue: () => T,
    private parse: (raw: string) => T,
    private io: DocumentIO,
    private notify: (state: DocumentSnapshot<T>) => void,
  ) {
    this.state = {
      value: createValue(),
      ready: false,
      status: "Loading…",
      error: "",
      dirty: false,
    };
  }
  private emit(patch: Partial<DocumentSnapshot<T>>) {
    this.state = { ...this.state, ...patch };
    if (this.active) this.notify(this.state);
  }
  private guard = () => {
    if (!this.active) throw new Error("Document load was cancelled.");
  };
  async load() {
    const epoch = ++this.readEpoch;
    try {
      const loaded = await bootstrap(this.path, async () => {
        this.guard();
        await this.io.ensureParent(this.path);
        this.guard();
        if (!(await this.io.exists(this.path))) {
          this.guard();
          const body = JSON.stringify(this.createValue(), null, 2);
          try {
            await this.io.create(this.path, body, this.guard);
            this.io.changed();
          } catch (error) {
            if (!(await this.io.exists(this.path))) throw error;
          }
        }
        this.guard();
        const raw = await this.io.read(this.path);
        return { raw, value: this.parse(raw) };
      });
      if (!this.active || epoch !== this.readEpoch) return;
      this.disk = loaded.raw;
      this.emit({
        value: loaded.value,
        ready: true,
        status: "Saved locally",
        error: "",
        dirty: false,
      });
    } catch (error) {
      if (this.active && epoch === this.readEpoch)
        this.emit({ error: message(error), status: "Unavailable" });
    }
  }
  update(value: T | ((old: T) => T)) {
    if (!this.active || !this.state.ready) return;
    const next =
      typeof value === "function"
        ? (value as (old: T) => T)(this.state.value)
        : value;
    this.revision++;
    this.readEpoch++;
    this.emit({ value: next, dirty: true, status: "Unsaved" });
  }
  flush() {
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        if (!this.state.dirty || this.disk === undefined) return;
        const body = JSON.stringify(this.state.value, null, 2),
          revision = this.revision,
          expected = this.disk;
        this.emit({ status: "Saving…" });
        try {
          await this.io.write(this.path, body, expected);
          this.disk = body;
          this.readEpoch++;
          if (this.revision === revision)
            this.emit({ dirty: false, status: "Saved locally", error: "" });
          else this.emit({ status: "Unsaved" });
          this.io.changed();
        } catch (error) {
          this.emit({ status: "Unsaved", error: message(error) });
        }
      });
    return this.queue;
  }
  async reload() {
    const revision = this.revision,
      epoch = ++this.readEpoch;
    await this.queue;
    // A successful in-flight save invalidates old reads; this reload starts after it.
    if (!this.active || this.revision !== revision) return;
    const readEpoch = Math.max(epoch, ++this.readEpoch);
    try {
      const raw = await this.io.read(this.path),
        value = this.parse(raw);
      if (
        !this.active ||
        this.revision !== revision ||
        this.readEpoch !== readEpoch
      )
        return;
      this.disk = raw;
      this.emit({
        value,
        dirty: false,
        ready: true,
        status: "Saved locally",
        error: "",
      });
    } catch (error) {
      if (this.active && this.readEpoch === readEpoch)
        this.emit({
          error: message(error),
          status: this.state.dirty ? "Unsaved" : this.state.status,
        });
    }
  }
  async refresh() {
    if (!this.active || !this.state.ready || this.state.dirty) return;
    const epoch = ++this.readEpoch,
      revision = this.revision;
    try {
      const raw = await this.io.read(this.path);
      if (
        !this.active ||
        this.state.dirty ||
        revision !== this.revision ||
        epoch !== this.readEpoch ||
        raw === this.disk
      )
        return;
      const value = this.parse(raw);
      this.disk = raw;
      this.emit({ value, error: "", status: "Saved locally" });
    } catch (error) {
      if (this.active && epoch === this.readEpoch)
        this.emit({ error: message(error) });
    }
  }
  dispose() {
    this.active = false;
    this.readEpoch++;
    return this.flush();
  }
}
