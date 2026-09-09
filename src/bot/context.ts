import { QueueManager } from "../music/QueueManager.js";
import { playlistRepository } from "../db/repositories/playlistRepository.js";
import { favoriteRepository } from "../db/repositories/favoriteRepository.js";
import { historyRepository } from "../db/repositories/historyRepository.js";

export interface AppContext {
  queueManager: QueueManager;
  playlists: typeof playlistRepository;
  favorites: typeof favoriteRepository;
  history: typeof historyRepository;
}

export function createContext(): AppContext {
  return {
    queueManager: new QueueManager(),
    playlists: playlistRepository,
    favorites: favoriteRepository,
    history: historyRepository,
  };
}
