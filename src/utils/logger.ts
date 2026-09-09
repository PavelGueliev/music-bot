import pino from "pino";
import { env } from "../config/env.js";

/**
 * pino выбран вместо console.log намеренно: он асинхронно пишет через
 * отдельный worker-поток сериализации, поэтому логирование не блокирует
 * единственное ядро event loop'а в горячем пути (тик плеера, обработка команд).
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

export function childLogger(scope: string) {
  return logger.child({ scope });
}
