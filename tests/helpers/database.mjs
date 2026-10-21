import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

// Execute the real migration and store SQL; only the D1 transport is adapted.
export async function testDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../../drizzle/", import.meta.url);
  const migrations = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) database.exec(await readFile(new URL(name, directory), "utf8"));
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { return { success: true, meta: statement.run(...values) }; }
      };
    },
    close() { database.close(); }
  };
}
