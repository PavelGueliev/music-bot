import { createAudioResource, StreamType, type AudioResource } from "@discordjs/voice";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { env } from "../config/env.js";
import { childLogger } from "../utils/logger.js";
import { resolveStreamUrl } from "./sources/ytdlp.js";
import type { Track } from "./types.js";

const logger = childLogger("audio-pipeline");

export interface PlaybackHandle {
  resource: AudioResource<Track>;
  /** Убивает ffmpeg-процесс. Обязательно вызывать на skip/stop/ошибку — иначе процесс зависает в фоне. */
  destroy: () => void;
}

/**
 * ffmpeg читает напрямую по HTTP из googlevideo-URL (без промежуточного
 * скачивания на диск и без второго процесса yt-dlp для передачи потока) —
 * один child process на трек, что минимизирует накладные расходы на
 * единственном ядре. ffmpeg отдаёт сырой PCM, а Opus-энкодинг (нативный,
 * через @discordjs/opus/libopus) делает уже @discordjs/voice — так мы
 * получаем регулировку громкости (inlineVolume) почти бесплатно по CPU.
 */
export async function createPlayback(track: Track): Promise<PlaybackHandle> {
  const { streamUrl, headers } = await resolveStreamUrl(track.url);

  const headerLines = Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\r\n");

  const args = [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    ...(headerLines ? ["-headers", headerLines] : []),
    "-i", streamUrl,
    "-analyzeduration", "0",
    "-loglevel", "warning",
    "-vn",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ];

  const ffmpeg: ChildProcessByStdio<null, Readable, Readable> = spawn(env.FFMPEG_PATH, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) logger.debug({ track: track.title, ffmpeg: text }, "ffmpeg stderr");
  });

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    ffmpeg.stdout.removeAllListeners();
    if (!ffmpeg.killed) {
      ffmpeg.kill("SIGKILL");
    }
  };

  ffmpeg.once("error", (error) => {
    logger.error({ error, track: track.title }, "ffmpeg process error");
  });
  ffmpeg.once("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGKILL") {
      logger.warn({ code, signal, track: track.title }, "ffmpeg завершился неожиданно");
    }
  });

  const resource = createAudioResource<Track>(ffmpeg.stdout, {
    inputType: StreamType.Raw,
    inlineVolume: true,
    metadata: track,
  });

  return { resource, destroy };
}
