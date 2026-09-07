import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs as a standalone CLI process (not inside the Next.js
// server runtime, which loads .env.local automatically). Load local dev env
// files here with a minimal parser so `pnpm db:generate`/`db:migrate` work
// without requiring an extra dependency (Next.js itself never imports this
// file). Real deploys set DATABASE_URL directly via the process environment
// (Dokploy env vars), so this loader is a local-dev convenience only.
function loadDotEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = (match[2] ?? "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvFile(".env.local");
loadDotEnvFile(".env");

// DATABASE_URL is intentionally read directly from process.env here (not via
// src/db/client.ts) since drizzle-kit runs as a standalone CLI process, not
// inside the Next.js server runtime.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and set it before running drizzle-kit.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
