import { isUrl } from "../utils/format.js";
import { childLogger } from "../utils/logger.js";
import { resolveFromUrl, searchYoutube } from "./sources/ytdlp.js";
import { isSpotifyUrl, resolveSpotifyUrl } from "./sources/spotify.js";
import { cacheKey, searchCache } from "./cache/searchCache.js";
import type { Track } from "./types.js";

const logger = childLogger("resolve-query");

/**
 * Единая точка входа для /play: понимает прямую ссылку YouTube,
 * ссылку Spotify (резолвит метаданные -> ищет соответствие на YouTube)
 * или обычный текстовый запрос.
 */
export async function resolveQuery(query: string, requestedBy: string, requestedById: string): Promise<Track[]> {
  const trimmed = query.trim();

  if (isUrl(trimmed)) {
    if (isSpotifyUrl(trimmed)) {
      const spotifyQueries = await resolveSpotifyUrl(trimmed);
      const tracks: Track[] = [];
      // Ищем последовательно с лёгкой конкурентностью, чтобы не запускать
      // десятки yt-dlp процессов одновременно на одном ядре.
      const CONCURRENCY = 3;
      for (let i = 0; i < spotifyQueries.length; i += CONCURRENCY) {
        const batch = spotifyQueries.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (q) => {
            try {
              const found = await searchYoutube(q.searchQuery, 1);
              return found[0] ?? null;
            } catch (error) {
              logger.warn({ error, query: q.searchQuery }, "Не удалось найти трек на YouTube для Spotify-записи");
              return null;
            }
          })
        );
        tracks.push(...results.filter((t): t is Track => t !== null));
      }
      return tracks.map((t) => ({ ...t, requestedBy, requestedById }));
    }

    const tracks = await resolveFromUrl(trimmed);
    return tracks.map((t) => ({ ...t, requestedBy, requestedById }));
  }

  const key = cacheKey(trimmed);
  const cached = searchCache.get(key);
  if (cached) return cached.map((t) => ({ ...t, requestedBy, requestedById }));

  const results = await searchYoutube(trimmed, 5);
  searchCache.set(key, results);
  return results.slice(0, 1).map((t) => ({ ...t, requestedBy, requestedById }));
}
