import { db } from "../database.js";
import type { Track } from "../../music/types.js";

interface FavoriteRow {
  title: string;
  url: string;
  duration_ms: number;
  thumbnail: string | null;
  added_at: number;
}

const stmts = {
  add: db.prepare(
    `INSERT INTO favorites (user_id, title, url, duration_ms, thumbnail, added_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, url) DO NOTHING`
  ),
  remove: db.prepare("DELETE FROM favorites WHERE user_id = ? AND url = ?"),
  list: db.prepare(
    "SELECT title, url, duration_ms, thumbnail, added_at FROM favorites WHERE user_id = ? ORDER BY added_at DESC"
  ),
  exists: db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND url = ?"),
};

export const favoriteRepository = {
  add(userId: string, track: Track): void {
    stmts.add.run(userId, track.title, track.url, track.durationMs, track.thumbnail ?? null, Date.now());
  },

  remove(userId: string, url: string): void {
    stmts.remove.run(userId, url);
  },

  isFavorite(userId: string, url: string): boolean {
    return Boolean(stmts.exists.get(userId, url));
  },

  list(userId: string): Track[] {
    const rows = stmts.list.all(userId) as FavoriteRow[];
    return rows.map((row) => ({
      title: row.title,
      url: row.url,
      durationMs: row.duration_ms,
      thumbnail: row.thumbnail ?? undefined,
      source: "youtube" as const,
    }));
  },
};
