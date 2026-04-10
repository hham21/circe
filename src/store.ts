import { AsyncLocalStorage } from "node:async_hooks";
import type { Session } from "./session.js";

export const sessionStore = new AsyncLocalStorage<Session>();

export function isStopped(): boolean {
  return sessionStore.getStore()?.shouldStop === true;
}
