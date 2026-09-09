import { env, config } from "../config/env.js";
import { childLogger } from "../utils/logger.js";

const logger = childLogger("lyrics");

interface GeniusHit {
  result: { title: string; primary_artist: { name: string }; url: string };
}

export interface LyricsResult {
  title: string;
  artist: string;
  geniusUrl: string;
  preview: string;
}

/**
 * Genius Web API отдаёт только метаданные и ссылку на страницу — самого
 * текста песни через официальный API нет. Поэтому берём небольшой превью
 * (не полный текст — из уважения к авторским правам) прямо со страницы
 * Genius и всегда прикладываем ссылку на оригинал.
 */
export async function findLyrics(query: string): Promise<LyricsResult | null> {
  if (!config.geniusEnabled) {
    throw new Error("Genius-интеграция не настроена (GENIUS_ACCESS_TOKEN)");
  }

  const searchRes = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${env.GENIUS_ACCESS_TOKEN}` },
  });
  if (!searchRes.ok) throw new Error(`Genius search failed: ${searchRes.status}`);
  const data = (await searchRes.json()) as { response: { hits: GeniusHit[] } };
  const hit = data.response.hits[0];
  if (!hit) return null;

  const { title, primary_artist, url } = hit.result;

  let preview = "Текст доступен по ссылке ниже.";
  try {
    const pageRes = await fetch(url);
    if (pageRes.ok) {
      const html = await pageRes.text();
      preview = extractPreview(html);
    }
  } catch (error) {
    logger.warn({ error, url }, "Не удалось получить превью текста песни со страницы Genius");
  }

  return { title, artist: primary_artist.name, geniusUrl: url, preview };
}

const PREVIEW_CHAR_LIMIT = 500;

function extractPreview(html: string): string {
  const blocks = [...html.matchAll(/data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1] ?? "");
  const text = blocks
    .join("\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

  if (!text) return "Текст доступен по ссылке ниже.";
  return text.length > PREVIEW_CHAR_LIMIT ? `${text.slice(0, PREVIEW_CHAR_LIMIT).trimEnd()}…` : text;
}
