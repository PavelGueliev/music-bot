-- WAL режим задаётся в database.ts программно (лучше конкурентный доступ, меньше блокировок).

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(owner_id, name)
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  thumbnail TEXT
);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  thumbnail TEXT,
  added_at INTEGER NOT NULL,
  UNIQUE(user_id, url)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  played_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_guild_id ON history(guild_id, played_at DESC);
