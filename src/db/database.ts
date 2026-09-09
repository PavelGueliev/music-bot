import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { childLogger } from "../utils/logger.js";

const logger = childLogger("db");
const __dirname = dirname(fileURLToPath(import.meta.url));

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

export const db = new Database(env.DATABASE_PATH);

// WAL: писатель не блокирует читателей — важно, т.к. на одном ядре
// нельзя позволить командам очереди/избранного ждать друг друга.
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

logger.info({ path: env.DATABASE_PATH }, "База данных инициализирована");

export function closeDatabase(): void {
  db.close();
}
