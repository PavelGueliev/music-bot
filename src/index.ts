import { env } from "./config/env.js";
import { childLogger } from "./utils/logger.js";
import { createContext } from "./bot/context.js";
import { createClient } from "./bot/client.js";
import { closeDatabase } from "./db/database.js";

const logger = childLogger("bootstrap");

const ctx = createContext();
const client = createClient(ctx);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Останавливаюсь: закрываю голосовые соединения и БД...");
  ctx.queueManager.destroyAll();
  closeDatabase();
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Необработанный rejection — продолжаю работу, но это стоит починить");
});
process.on("uncaughtException", (error) => {
  logger.error({ error }, "Необработанное исключение — продолжаю работу, но это стоит починить");
});

client.login(env.DISCORD_TOKEN).catch((error) => {
  logger.fatal({ error }, "Не удалось залогиниться в Discord");
  process.exit(1);
});
