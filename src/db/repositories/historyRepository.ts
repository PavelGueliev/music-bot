import { db } from "../database.js";
import type { Track } from "../../music/types.js";

interface HistoryRow {
  title: string;
  url: string;
  duration_ms: number;
  played_at: number;
}

const MAX_ROWS_PER_GUILD = 100;

const stmts = {
  insert: db.prepare(
    `INSERT INTO history (guild_id, user_id, title, url, duration_ms, played_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  listByGuild: db.prepare(
    "SELECT title, url, duration_ms, played_at FROM history WHERE guild_id = ? ORDER BY played_at DESC LIMIT ?"
  ),
  // Держим таблицу маленькой: без этого история росла бы бесконечно и со временем
  // замедляла бы каждый INSERT/SELECT — что прямо бьёт по единственному ядру.
  trim: db.prepare(
    `DELETE FROM history WHERE guild_id = ? AND id NOT IN (
       SELECT id FROM history WHERE guild_id = ? ORDER BY played_at DESC LIMIT ?
     )`
  ),
};

export const historyRepository = {
  record(guildId: string, userId: string, track: Track): void {
    stmts.insert.run(guildId, userId, track.title, track.url, track.durationMs, Date.now());
    stmts.trim.run(guildId, guildId, MAX_ROWS_PER_GUILD);
  },

  recent(guildId: string, limit = 10): Track[] {
    const rows = stmts.listByGuild.all(guildId, limit) as HistoryRow[];
    return rows.map((row) => ({
      title: row.title,
      url: row.url,
      durationMs: row.duration_ms,
      source: "youtube" as const,
    }));
  },
};
