export interface Track {
  title: string;
  /** Каноническая ссылка (youtube watch url) — по ней всегда можно заново получить прямой стрим. */
  url: string;
  durationMs: number;
  thumbnail?: string;
  source: "youtube";
  /** Юзернейм для отображения (например, в подвале embed'а). */
  requestedBy?: string;
  /** Discord ID того, кто запросил трек — для записи в историю. */
  requestedById?: string;
}

export type LoopMode = "off" | "track" | "queue";

export interface ResolvedStream {
  /** Прямой URL на аудиопоток (googlevideo и т.п.), отдаётся ffmpeg напрямую — без промежуточного скачивания. */
  streamUrl: string;
  headers: Record<string, string>;
}
