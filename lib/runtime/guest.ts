/** Phase 2 compute seam. v1 uses the browser command router. */
export interface GuestRuntime {
  boot(): Promise<void>;
  exec(
    argv: string[],
    stdin?: string,
  ): Promise<{ code: number; stdout: string; stderr: string }>;
  writeFile(path: string, content: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  shutdown(): Promise<void>;
}
