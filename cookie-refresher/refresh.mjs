/**
 * Разовый запуск (не демон): открывает headless-браузер с сохранённой
 * сессией (storageState.json), заходит на youtube.com — это даёт Google
 * шанс продлить ротируемые токены сессии, как это происходит в обычном
 * браузере, — и сохраняет результат обратно в cookies.txt + storageState.json.
 *
 * Запускается снаружи по расписанию (cron -> `docker compose run --rm
 * cookie-refresher`), а не живёт постоянно — между запусками с сервера не
 * съедено ни байта под браузер.
 *
 * ВАЖНО: если сессия оказалась разлогинена — НИЧЕГО не перезаписываем.
 * Тихая перезапись рабочего файла протухшим/анонимным — именно то, что
 * уже один раз тихо сломало возрастные видео (см. CLAUDE.md).
 */
import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";

const STORAGE_STATE_PATH = process.env.STORAGE_STATE_PATH || "/data/storageState.json";
const COOKIES_OUT_PATH = process.env.COOKIES_OUT_PATH || "/data/cookies.txt";
const AUTH_COOKIE_NAMES = ["SID", "SAPISID", "LOGIN_INFO"];

function toNetscape(cookies) {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const c of cookies) {
    const includeSubdomains = c.domain.startsWith(".") ? "TRUE" : "FALSE";
    const secure = c.secure ? "TRUE" : "FALSE";
    const expiry = c.expires && c.expires > 0 ? Math.floor(c.expires) : 0;
    const domainField = c.httpOnly ? `#HttpOnly_${c.domain}` : c.domain;
    lines.push([domainField, includeSubdomains, c.path || "/", secure, expiry, c.name, c.value].join("\t"));
  }
  return lines.join("\n") + "\n";
}

async function main() {
  if (!existsSync(STORAGE_STATE_PATH)) {
    console.error(`Нет ${STORAGE_STATE_PATH} — не с чего продлевать сессию. Нужен разовый ручной экспорт.`);
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await context.newPage();

    await page.goto("https://www.youtube.com", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(3_000); // дать фоновому JS отработать обновление токенов

    const cookies = await context.cookies();
    const hasAuth = AUTH_COOKIE_NAMES.some((name) => cookies.some((c) => c.name === name));

    if (!hasAuth) {
      console.error(
        "Сессия разлогинена (нет SID/SAPISID/LOGIN_INFO) — файлы НЕ трогаю, старые остаются как есть. Нужен новый ручной экспорт сессии."
      );
      process.exitCode = 1;
      return;
    }

    writeFileSync(COOKIES_OUT_PATH, toNetscape(cookies));
    await context.storageState({ path: STORAGE_STATE_PATH });

    console.log(`✅ ${new Date().toISOString()} — обновлено: ${cookies.length} кук → ${COOKIES_OUT_PATH}`);
  } catch (error) {
    console.error("Ошибка при обновлении сессии:", error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
