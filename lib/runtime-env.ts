import { AsyncLocalStorage } from "node:async_hooks";

export type RuntimeEnv = {
  DB?: D1Database;
};

const runtimeEnvStorage = new AsyncLocalStorage<RuntimeEnv>();

export function runWithRuntimeEnv<T>(env: RuntimeEnv, callback: () => T) {
  return runtimeEnvStorage.run(env, callback);
}

export function getRuntimeEnv() {
  return runtimeEnvStorage.getStore();
}
