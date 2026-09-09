import QuickLRU from "quick-lru";
import type { Track } from "../types.js";

/**
 * LRU с TTL — повторный поиск того же запроса (частый кейс: несколько людей
 * просят одно и то же, или пользователь опечатался и повторил) не бьёт
 * заново процессом yt-dlp по сети. Ограничен по размеру, чтобы не течь по памяти.
 */
export const searchCache = new QuickLRU<string, Track[]>({
  maxSize: 300,
  maxAge: 10 * 60 * 1000, // 10 минут
});

export function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}
