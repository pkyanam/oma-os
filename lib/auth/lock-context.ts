import { AsyncLocalStorage } from "node:async_hooks";
export const authLockContext = new AsyncLocalStorage<{
  key: string;
  owner: string;
  sessionId: string;
  signal: AbortSignal;
}>();
