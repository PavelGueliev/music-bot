export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function progressBar(currentMs: number, totalMs: number, size = 20): string {
  if (totalMs <= 0) return "▬".repeat(size);
  const ratio = Math.min(Math.max(currentMs / totalMs, 0), 1);
  const filled = Math.round(ratio * size);
  return "▬".repeat(filled) + "🔘" + "▬".repeat(Math.max(size - filled, 0));
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

export function isUrl(text: string): boolean {
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

export type SeekTarget = { type: "absolute"; seconds: number } | { type: "relative"; deltaSeconds: number };

/**
 * Парсит ввод /seek: "90" (секунды), "1:30" (мм:сс), "1:05:20" (чч:мм:сс),
 * либо относительно текущей позиции — "+15" / "-15".
 */
export function parseSeekInput(input: string): SeekTarget | null {
  const trimmed = input.trim();

  const relative = /^([+-])\s*(\d+)$/.exec(trimmed);
  if (relative) {
    const sign = relative[1] === "-" ? -1 : 1;
    return { type: "relative", deltaSeconds: sign * Number(relative[2]) };
  }

  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) {
    return null;
  }
  const seconds = parts.reduce((acc, part) => acc * 60 + Number(part), 0);
  return { type: "absolute", seconds };
}
