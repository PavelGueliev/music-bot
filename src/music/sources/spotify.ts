import { env, config } from "../../config/env.js";
import { childLogger } from "../../utils/logger.js";

const logger = childLogger("spotify");

/**
 * ВАЖНО: Spotify Web API не отдаёт аудиопоток трека — по условиям лицензии
 * стриминг звука разрешён только официальными клиентами / Web Playback SDK
 * в браузере с Premium-аккаунтом. Здесь Spotify используется исключительно
 * как источник метаданных (название/исполнитель) для ссылок вида
 * open.spotify.com/track|playlist|album/... — реальный звук по этим
 * названиям затем ищется на YouTube через ytdlp.searchYoutube().
 */

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 5_000) {
    return tokenCache.token;
  }
  const basic = Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Spotify auth failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function spotifyFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Spotify API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface SpotifyQuery {
  /** Строка "исполнитель - название", готовая для поиска на YouTube. */
  searchQuery: string;
  title: string;
}

interface SpotifyTrackObject {
  name: string;
  artists: { name: string }[];
}

const SPOTIFY_URL_RE = /open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;

export function isSpotifyUrl(url: string): boolean {
  return SPOTIFY_URL_RE.test(url);
}

function trackToQuery(t: SpotifyTrackObject): SpotifyQuery {
  const artists = t.artists.map((a) => a.name).join(", ");
  return { searchQuery: `${artists} - ${t.name}`, title: `${artists} - ${t.name}` };
}

/** Возвращает список поисковых запросов для YouTube по треку/альбому/плейлисту Spotify. */
export async function resolveSpotifyUrl(url: string): Promise<SpotifyQuery[]> {
  if (!config.spotifyEnabled) {
    throw new Error("Spotify-интеграция не настроена (SPOTIFY_CLIENT_ID/SECRET)");
  }
  const match = SPOTIFY_URL_RE.exec(url);
  if (!match) throw new Error("Не похоже на ссылку Spotify");
  const [, type, id] = match;

  try {
    if (type === "track") {
      const track = await spotifyFetch<SpotifyTrackObject>(`/tracks/${id}`);
      return [trackToQuery(track)];
    }

    if (type === "album") {
      const album = await spotifyFetch<{ tracks: { items: SpotifyTrackObject[] } }>(`/albums/${id}`);
      return album.tracks.items.map(trackToQuery);
    }

    // playlist
    const playlist = await spotifyFetch<{ tracks: { items: { track: SpotifyTrackObject | null }[] } }>(
      `/playlists/${id}?fields=tracks.items(track(name,artists(name)))`
    );
    return playlist.tracks.items.filter((i) => i.track).map((i) => trackToQuery(i.track as SpotifyTrackObject));
  } catch (error) {
    logger.error({ error, url }, "Не удалось резолвнуть Spotify-ссылку");
    throw error;
  }
}
