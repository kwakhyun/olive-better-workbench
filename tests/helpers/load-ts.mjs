import { readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(new URL("../../package.json", import.meta.url));

// Load actual TS/TSX components with the project's compiler, without a DOM shim.
export function createTsLoader() {
  const cache = new Map();
  const session = crypto.randomUUID();
  async function moduleUrl(path) {
    if (!/\.tsx?$/.test(path)) return pathToFileURL(path).href;
    if (cache.has(path)) return cache.get(path);
    const source = await readFile(path, "utf8");
    let code = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    for (const { fileName: specifier } of ts.preProcessFile(code).importedFiles) {
      let target;
      if (specifier.startsWith(".") || specifier.startsWith("@/")) {
        const base = specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : resolve(dirname(path), specifier);
        for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`]) {
          try { await access(candidate); target = candidate; break; } catch { /* Try the next source extension. */ }
        }
        if (!target) throw new Error(`Cannot resolve ${specifier} from ${path}`);
      } else {
        target = require.resolve(specifier);
      }
      const url = await moduleUrl(target);
      code = code.replaceAll(JSON.stringify(specifier), JSON.stringify(url));
    }
    const url = `data:text/javascript;base64,${Buffer.from(`// ${session}\n${code}`).toString("base64")}`;
    cache.set(path, url);
    return url;
  }
  return async (relativePath) => import(await moduleUrl(resolve(root, relativePath)));
}
