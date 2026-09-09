import "dotenv/config";
import { z } from "zod";

/**
 * Валидируем окружение один раз при старте — если чего-то не хватает,
 * падаем сразу с понятной ошибкой, а не через час работы посреди голосового канала.
 */
const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN обязателен"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID обязателен"),
  DISCORD_DEV_GUILD_ID: z.string().optional(),

  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),

  GENIUS_ACCESS_TOKEN: z.string().optional(),

  YTDLP_PATH: z.string().default("yt-dlp"),
  FFMPEG_PATH: z.string().default("ffmpeg"),

  DATABASE_PATH: z.string().default("./data/musicbot.db"),

  DEFAULT_VOLUME: z.coerce.number().min(0).max(200).default(100),
  IDLE_LEAVE_MINUTES: z.coerce.number().min(0).default(5),
  MAX_QUEUE_SIZE: z.coerce.number().min(1).default(500),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Некорректная конфигурация окружения:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export const config = {
  spotifyEnabled: Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET),
  geniusEnabled: Boolean(env.GENIUS_ACCESS_TOKEN),
} as const;
