import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and set it.",
  );
}

// A single shared Pool for the lifetime of the process. This app runs as one
// long-lived container (Next.js server + cron in-process), so there is no
// serverless cold-start concern that would push us toward per-request
// connections.
const pool = new Pool({ connectionString: databaseUrl });

export const db = drizzle(pool, { schema });

export type Database = typeof db;
