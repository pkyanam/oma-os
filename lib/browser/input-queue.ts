export type BrowserInput = {
  action: string;
  sessionId: string;
  [key: string]: unknown;
};
/** Preserve meaningful input order while coalescing high-frequency pointer traffic. */
export class BrowserInputQueue {
  private items: BrowserInput[] = [];
  private running = false;
  private generation = 0;
  constructor(private process: (input: BrowserInput) => Promise<void>) {}
  enqueue(input: BrowserInput) {
    const last = this.items.at(-1);
    if (last?.sessionId === input.sessionId && last.action === input.action) {
      if (
        (input.action === "pointer" &&
          input.phase === "move" &&
          last.phase === "move") ||
        input.action === "resize"
      ) {
        this.items[this.items.length - 1] = input;
        return;
      }
      if (
        input.action === "type" &&
        typeof last.text === "string" &&
        typeof input.text === "string" &&
        last.text.length + input.text.length <= 10000
      ) {
        last.text += input.text;
        return;
      }
      if (input.action === "scroll") {
        last.deltaX = Number(last.deltaX || 0) + Number(input.deltaX || 0);
        last.deltaY = Number(last.deltaY || 0) + Number(input.deltaY || 0);
        last.x = input.x;
        last.y = input.y;
        return;
      }
    }
    if (this.items.length >= 128)
      throw new Error(
        "The webpage is still processing your input. Wait a moment before continuing.",
      );
    this.items.push(input);
    void this.pump();
  }
  clear() {
    this.items = [];
    this.generation++;
    this.running = false;
  }
  private async pump() {
    if (this.running) return;
    this.running = true;
    const generation = this.generation;
    try {
      while (this.items.length && generation === this.generation) {
        const item = this.items.shift()!;
        await this.process(item).catch(() => {});
      }
    } finally {
      if (generation === this.generation) this.running = false;
    }
  }
}
