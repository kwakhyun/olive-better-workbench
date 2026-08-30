import { lstat, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const nestedOverride = resolve(root, "node_modules/vinext/node_modules/image-size");

try {
  const stats = await lstat(nestedOverride);
  if (!stats.isSymbolicLink()) {
    throw new Error(`Refusing to replace non-symlink path: ${nestedOverride}`);
  }
  await rm(nestedOverride);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
