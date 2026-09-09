import { db } from "../database.js";
import type { Track } from "../../music/types.js";

export interface PlaylistRow {
  id: number;
  owner_id: string;
  name: string;
  created_at: number;
}

interface PlaylistTrackRow {
  position: number;
  title: string;
  url: string;
  duration_ms: number;
  thumbnail: string | null;
}

// Подготовленные statements переиспользуются между вызовами — better-sqlite3
// кэширует план выполнения, повторный db.prepare() на каждый вызов был бы лишней тратой CPU.
const stmts = {
  create: db.prepare(
    "INSERT INTO playlists (owner_id, name, created_at) VALUES (?, ?, ?)"
  ),
  findByOwnerAndName: db.prepare(
    "SELECT * FROM playlists WHERE owner_id = ? AND name = ?"
  ),
  listByOwner: db.prepare(
    "SELECT * FROM playlists WHERE owner_id = ? ORDER BY created_at DESC"
  ),
  deleteById: db.prepare("DELETE FROM playlists WHERE id = ?"),
  clearTracks: db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?"),
  insertTrack: db.prepare(
    `INSERT INTO playlist_tracks (playlist_id, position, title, url, duration_ms, thumbnail)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  tracksByPlaylist: db.prepare(
    "SELECT position, title, url, duration_ms, thumbnail FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC"
  ),
};

export const playlistRepository = {
  create(ownerId: string, name: string): PlaylistRow {
    const info = stmts.create.run(ownerId, name, Date.now());
    return stmts.findByOwnerAndName.get(ownerId, name) as PlaylistRow;
  },

  find(ownerId: string, name: string): PlaylistRow | undefined {
    return stmts.findByOwnerAndName.get(ownerId, name) as PlaylistRow | undefined;
  },

  list(ownerId: string): PlaylistRow[] {
    return stmts.listByOwner.all(ownerId) as PlaylistRow[];
  },

  delete(id: number): void {
    stmts.deleteById.run(id);
  },

  /** Полная перезапись треков плейлиста в одной транзакции. */
  saveTracks(playlistId: number, tracks: Track[]): void {
    const tx = db.transaction((items: Track[]) => {
      stmts.clearTracks.run(playlistId);
      items.forEach((track, index) => {
        stmts.insertTrack.run(
          playlistId,
          index,
          track.title,
          track.url,
          track.durationMs,
          track.thumbnail ?? null
        );
      });
    });
    tx(tracks);
  },

  getTracks(playlistId: number): Track[] {
    const rows = stmts.tracksByPlaylist.all(playlistId) as PlaylistTrackRow[];
    return rows.map((row) => ({
      title: row.title,
      url: row.url,
      durationMs: row.duration_ms,
      thumbnail: row.thumbnail ?? undefined,
      source: "youtube" as const,
    }));
  },
};
