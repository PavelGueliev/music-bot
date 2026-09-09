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
