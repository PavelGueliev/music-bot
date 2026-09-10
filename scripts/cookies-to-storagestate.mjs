#!/usr/bin/env node
/**
 * Конвертирует cookies.txt (формат Netscape, тот же, что даёт расширение
 * "Get cookies.txt LOCALLY") в storageState.json (формат Playwright) —
 * чтобы серверный headless-браузер мог периодически "продлевать" сессию
 * и обновлять куки сам, без ручного переэкспорта каждый раз.
 *
 * Чистый Node, без зависимостей — не нужно ничего ставить, чтобы запустить.
 *
 * Использование:
 *   node scripts/cookies-to-storagestate.mjs <путь-к-cookies.txt> [путь-к-storageState.json]
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , inputPath, outputPath = "storageState.json"] = process.argv;

if (!inputPath) {
  console.error("Использование: node cookies-to-storagestate.mjs <cookies.txt> [storageState.json]");
  process.exit(1);
}

const raw = readFileSync(inputPath, "utf-8");
const cookies = [];

for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || (trimmed.startsWith("#") && !trimmed.startsWith("#HttpOnly_"))) continue;

  let domain = trimmed;
  let httpOnly = false;
  if (domain.startsWith("#HttpOnly_")) {
    httpOnly = true;
    domain = domain.slice("#HttpOnly_".length);
  }

  const parts = domain.split("\t");
  if (parts.length < 7) continue;
  const [cookieDomain, , path, secureFlag, expiryRaw, name, ...valueParts] = parts;
  const value = valueParts.join("\t"); // на случай табов внутри значения

  const expiryNum = Number(expiryRaw);
  const expires = !expiryNum || expiryNum <= 0 ? -1 : expiryNum; // 0/пусто = сессионная кука

  cookies.push({
    name,
    value,
    domain: cookieDomain,
    path: path || "/",
    expires,
    httpOnly,
    secure: secureFlag === "TRUE",
    sameSite: "Lax",
  });
}

if (cookies.length === 0) {
  console.error("Не нашёл ни одной куки — проверь путь и формат файла.");
  process.exit(1);
}

const authCookieNames = ["SID", "SAPISID", "LOGIN_INFO"];
const hasAuth = authCookieNames.some((n) => cookies.some((c) => c.name === n));
if (!hasAuth) {
  console.warn("⚠️  Не вижу SID/SAPISID/LOGIN_INFO среди кук — сессия может быть неполной.");
}

const storageState = { cookies, origins: [] };
writeFileSync(outputPath, JSON.stringify(storageState, null, 2));

console.log(`✅ ${cookies.length} кук сконвертировано → ${outputPath}`);
