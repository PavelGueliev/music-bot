import { execFile, type ExecFileException } from "node:child_process";
import { env } from "../../config/env.js";
import { childLogger } from "../../utils/logger.js";
import type { ResolvedStream, Track } from "../types.js";

const logger = childLogger("ytdlp");

// Таймауты — жёсткий предел на любой вызов внешнего процесса. Если YouTube
// тормозит или yt-dlp завис на конкретном видео, мы не должны положить
// весь бот: execFile сам убьёт процесс по истечении timeout.
const SEARCH_TIMEOUT_MS = 15_000;
const RESOLVE_TIMEOUT_MS = 20_000;
const MAX_BUFFER = 10 * 1024 * 1024; // 10MB на JSON-вывод с лихвой хватает

interface YtDlpFlatEntry {
  id?: string;
  url?: string;
  title?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url: string }[];
  _type?: string;
}

interface YtDlpFullInfo extends YtDlpFlatEntry {
  webpage_url?: string;
  http_headers?: Record<string, string>;
  requested_downloads?: { url: string; http_headers?: Record<string, string> }[];
  entries?: YtDlpFlatEntry[];
}

// --js-runtimes node: YouTube требует решать JS-челлендж подписи формата для
// залогиненных (по кукам) запросов — без этого флага yt-dlp не находит
// доступный JS-рантайм (даже при наличии node в PATH) и падает с
// "The page needs to be reloaded". Node в образе есть всегда (это рантайм
// самого бота), безопасно включать всегда, даже без кук — вреда не будет.
//
// --cookies — НАМЕРЕННО не на каждый вызов, а только там, где явно передан
// useCookies=true (см. resolveStreamUrl). Реальный инцидент: включили их
// глобально — и поиск/автоплей стали тихо возвращать 0 результатов для
// explicit-контента ("ничего не найдено", EXIT 0, без единой ошибки) —
// YouTube Restricted Mode/SafeSearch, завязанный на залогиненный аккаунт,
// фильтрует такую выдачу для авторизованной сессии, а анонимная — нет.
// Куки нужны только на шаге получения самого аудиопотока (обход возрастного
// ограничения), не для поиска/подбора кандидатов.
function withDefaultArgs(args: string[], useCookies: boolean): string[] {
  const base = ["--js-runtimes", "node", ...args];
  return useCookies && env.YTDLP_COOKIES_FILE ? ["--cookies", env.YTDLP_COOKIES_FILE, ...base] : base;
}

function run(args: string[], timeoutMs: number, useCookies = false): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      env.YTDLP_PATH,
      withDefaultArgs(args, useCookies),
      { timeout: timeoutMs, maxBuffer: MAX_BUFFER, killSignal: "SIGKILL" },
      (error: ExecFileException | null, stdout, stderr) => {
        if (error) {
          const timedOut = error.killed;
          // yt-dlp может выйти с ненулевым кодом уже ПОСЛЕ того, как успешно
          // напечатал нужный JSON в stdout — например, если не смог
          // дозаписать обновлённые cookies обратно в файл (реальный кейс:
          // read-only mount) или споткнулся на второстепенном шаге вроде
          // превью. Если полезные данные всё же есть — используем их, а не
          // выбрасываем целиком из-за некритичной хвостовой ошибки.
          if (!timedOut && stdout.trim().length > 0) {
            logger.warn({ args, stderr: stderr?.slice(0, 500) }, "yt-dlp вышел с ошибкой, но данные получены — использую их");
            resolve(stdout);
            return;
          }
          logger.warn({ args, timedOut, stderr: stderr?.slice(0, 500) }, "yt-dlp завершился с ошибкой");
          reject(error);
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function toCanonicalUrl(entry: YtDlpFlatEntry): string {
  if (entry.url && entry.url.startsWith("http")) return entry.url;
  if (entry.id) return `https://www.youtube.com/watch?v=${entry.id}`;
  return entry.url ?? "";
}

function toTrack(entry: YtDlpFlatEntry): Track {
  return {
    title: entry.title ?? "Без названия",
    url: toCanonicalUrl(entry),
    durationMs: Math.round((entry.duration ?? 0) * 1000),
    thumbnail: entry.thumbnail ?? entry.thumbnails?.at(-1)?.url,
    source: "youtube",
  };
}

/** Быстрый поиск (flat-playlist — без резолва форматов каждого видео). */
export async function searchYoutube(query: string, limit = 5): Promise<Track[]> {
  const stdout = await run(
    [
      `ytsearch${limit}:${query}`,
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      "--skip-download",
    ],
    SEARCH_TIMEOUT_MS
  );

  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return toTrack(JSON.parse(line) as YtDlpFlatEntry);
      } catch {
        return null;
      }
    })
    .filter((t): t is Track => t !== null && Boolean(t.url));
}

/** Резолв ссылки: одиночное видео или плейлист YouTube. */
export async function resolveFromUrl(url: string): Promise<Track[]> {
  const stdout = await run(
    ["--flat-playlist", "--dump-json", "--no-warnings", "--skip-download", url],
    RESOLVE_TIMEOUT_MS
  );

  const lines = stdout.split("\n").filter(Boolean);
  const tracks: Track[] = [];
  for (const line of lines) {
    try {
      tracks.push(toTrack(JSON.parse(line) as YtDlpFlatEntry));
    } catch {
      // пропускаем битую строку, не роняем весь резолв
    }
  }
  return tracks;
}

/**
 * Резолвим прямой аудио-URL непосредственно перед проигрыванием (лениво,
 * а не для всей очереди сразу) — googlevideo-ссылки живут ограниченное время,
 * и нет смысла тратить CPU/сеть на треки, которые могут быть пропущены.
 */
export async function resolveStreamUrl(url: string): Promise<ResolvedStream> {
  const stdout = await run(
    ["-f", "bestaudio/best", "-j", "--no-warnings", "--no-playlist", url],
    RESOLVE_TIMEOUT_MS,
    true // куки — только здесь, см. комментарий у withDefaultArgs
  );
  const info = JSON.parse(stdout) as YtDlpFullInfo;
  const chosen = info.requested_downloads?.[0] ?? info;
  if (!chosen.url) {
    throw new Error("yt-dlp не вернул прямую ссылку на аудиопоток");
  }
  return {
    streamUrl: chosen.url,
    headers: chosen.http_headers ?? info.http_headers ?? {},
  };
}

function extractVideoId(url: string): string | null {
  try {
    return new URL(url).searchParams.get("v");
  } catch {
    return null;
  }
}

/**
 * Автоплей: вместо своей системы рекомендаций используем готовый YouTube
 * Mix (`RD<videoId>`) — тот же алгоритм, на котором построено автовоспроиз-
 * ведение самого YouTube. Первый элемент микса обычно совпадает с исходным
 * видео — его пропускаем, чтобы не повторяться. --playlist-end ограничивает
 * выборку: миксы могут быть практически бесконечными, тянуть всё не нужно —
 * следующая порция подбирается заново от последнего реально сыгранного трека.
 */
export async function getRelatedTracks(seedUrl: string, limit = 5): Promise<Track[]> {
  const videoId = extractVideoId(seedUrl);
  if (!videoId) return [];

  const mixUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;
  try {
    const stdout = await run(
      [
        "--flat-playlist",
        "--dump-json",
        "--no-warnings",
        "--skip-download",
        "--playlist-end",
        String(limit + 1),
        mixUrl,
      ],
      RESOLVE_TIMEOUT_MS
    );

    const tracks: Track[] = [];
    for (const line of stdout.split("\n").filter(Boolean)) {
      try {
        const entry = JSON.parse(line) as YtDlpFlatEntry;
        if (entry.id === videoId) continue; // сам исходный трек — уже играл
        tracks.push(toTrack(entry));
      } catch {
        // пропускаем битую строку, не роняем весь автоплей
      }
    }
    return tracks.slice(0, limit);
  } catch (error) {
    logger.warn({ error, seedUrl }, "Автоплей: не удалось получить YouTube Mix");
    return [];
  }
}
