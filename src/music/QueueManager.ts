import { EventEmitter } from "node:events";
import { childLogger } from "../utils/logger.js";
import { GuildPlayer } from "./GuildPlayer.js";

const logger = childLogger("queue-manager");

/**
 * Реестр плееров по гильдиям. Плеер создаётся лениво и уничтожается сразу,
 * как только не нужен (см. GuildPlayer.destroy) — простаивающая гильдия
 * не держит открытых соединений/таймеров/памяти.
 *
 * Эмитит "created" при создании нового GuildPlayer — так bot/client.ts может
 * навесить общие обработчики (trackStart и т.п.) на каждый плеер сразу при рождении.
 */
export class QueueManager extends EventEmitter {
  private readonly players = new Map<string, GuildPlayer>();

  get(guildId: string): GuildPlayer | undefined {
    return this.players.get(guildId);
  }

  getOrCreate(guildId: string): GuildPlayer {
    let player = this.players.get(guildId);
    if (!player) {
      player = new GuildPlayer(guildId);
      player.once("disconnected", () => {
        this.players.delete(guildId);
        logger.debug({ guildId }, "Плеер гильдии уничтожен и убран из реестра");
      });
      this.players.set(guildId, player);
      this.emit("created", player);
    }
    return player;
  }

  destroyAll(): void {
    for (const player of this.players.values()) {
      player.destroy();
    }
    this.players.clear();
  }

  get activeCount(): number {
    return this.players.size;
  }
}
