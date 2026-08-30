import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const wranglerDirectory = resolve(root, ".wrangler");
const configPath = resolve(wranglerDirectory, "local-d1.json");
const databaseName = "site-creator-d1";

await mkdir(wranglerDirectory, { recursive: true });
await writeFile(
  configPath,
  JSON.stringify(
    {
      name: "olive-better-local",
      main: resolve(root, "worker/index.ts"),
      compatibility_date: "2026-08-30",
      compatibility_flags: ["nodejs_compat"],
      d1_databases: [
        {
          binding: "DB",
          database_name: databaseName,
          database_id: "00000000-0000-4000-8000-000000000000",
          migrations_dir: resolve(root, "drizzle")
        }
      ]
    },
    null,
    2
  )
);

const result = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "migrations",
    "apply",
    databaseName,
    "--local",
    "--config",
    configPath,
    "--persist-to",
    resolve(root, ".wrangler/state")
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: resolve(wranglerDirectory, "migration.log")
    },
    stdio: "inherit"
  }
);

if (result.status !== 0) process.exit(result.status ?? 1);
