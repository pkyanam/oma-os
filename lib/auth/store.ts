import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { KeyValueStore } from "@opencoredev/loginwithchatgpt-server";
import { authLockContext } from "./lock-context";
export class FileStore<T> implements KeyValueStore<T> {
  constructor(private directory: string) {}
  private path(key: string) {
    return join(
      this.directory,
      createHash("sha256").update(key).digest("hex") + ".json",
    );
  }
  async get(key: string): Promise<T | undefined> {
    try {
      const entry = JSON.parse(await readFile(this.path(key), "utf8")); // Never unlink on expired reads: a concurrent writer may already have renewed this path.
      if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now())
        return undefined;
      return entry.value as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  async set(key: string, value: T, options?: { ttlMs?: number }) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.path(key),
      temp = path + "." + randomUUID();
    try {
      await writeFile(
        temp,
        JSON.stringify({
          value,
          expiresAt:
            options?.ttlMs !== undefined
              ? Date.now() + options.ttlMs
              : undefined,
        }),
        { mode: 0o600, flag: "wx" },
      );
      await rename(temp, path);
    } finally {
      await unlink(temp).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
  async delete(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
export type RedisCommand = (args: (string | number)[]) => Promise<unknown>;
export function redisCommand(
  url: string,
  token: string,
  transport: typeof fetch = fetch,
): RedisCommand {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
    throw new Error(
      "Redis REST endpoint must use HTTPS without URL credentials",
    );
  return async (args) => {
    const response = await transport(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Session store unavailable");
    const json = await response.json();
    if (json.error) throw new Error("Session store operation failed");
    return json.result;
  };
}
export class RedisStore<T> implements KeyValueStore<T> {
  private command: RedisCommand;
  constructor(
    url: string,
    token: string,
    private prefix = "oma:",
    command?: RedisCommand,
  ) {
    this.command = command ?? redisCommand(url, token);
  }
  async get(key: string): Promise<T | undefined> {
    const result = await this.command(["GET", this.prefix + key]);
    return typeof result === "string" ? JSON.parse(result) : undefined;
  }
  async set(key: string, value: T, options?: { ttlMs?: number }) {
    const lock = authLockContext.getStore();
    lock?.signal.throwIfAborted();
    const ttl =
      options?.ttlMs !== undefined ? Math.max(1, Math.ceil(options.ttlMs)) : 0;
    if (lock) {
      if (key !== lock.sessionId)
        throw new Error("Session lock scope mismatch");
      const written = await this.command([
        "EVAL",
        "if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end; if tonumber(ARGV[3]) > 0 then redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3]) else redis.call('SET',KEYS[2],ARGV[2]) end; return 1",
        2,
        lock.key,
        this.prefix + key,
        lock.owner,
        JSON.stringify(value),
        ttl,
      ]);
      if (written !== 1) throw new Error("Session lease expired");
    } else
      await this.command([
        "SET",
        this.prefix + key,
        JSON.stringify(value),
        ...(ttl ? ["PX", ttl] : []),
      ]);
  }
  async delete(key: string) {
    const lock = authLockContext.getStore();
    lock?.signal.throwIfAborted();
    if (lock) {
      if (key !== lock.sessionId)
        throw new Error("Session lock scope mismatch");
      const deleted = await this.command([
        "EVAL",
        "if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end; redis.call('DEL',KEYS[2]); return 1",
        2,
        lock.key,
        this.prefix + key,
        lock.owner,
      ]);
      if (deleted !== 1) throw new Error("Session lease expired");
    } else await this.command(["DEL", this.prefix + key]);
  }
}
