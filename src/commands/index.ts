import { Collection } from "discord.js";
import type { Command } from "./types.js";
import { playCommand } from "./play.js";
import { skipCommand } from "./skip.js";
import { pauseCommand } from "./pause.js";
import { resumeCommand } from "./resume.js";
import { stopCommand } from "./stop.js";
import { queueCommand } from "./queue.js";
import { removeCommand } from "./remove.js";
import { loopCommand } from "./loop.js";
import { shuffleCommand } from "./shuffle.js";
import { volumeCommand } from "./volume.js";
import { nowPlayingCommand } from "./nowplaying.js";
import { playlistCommand } from "./playlist.js";
import { favoriteCommand } from "./favorite.js";
import { historyCommand } from "./history.js";
import { lyricsCommand } from "./lyrics.js";

export const commandList: Command[] = [
  playCommand,
  skipCommand,
  pauseCommand,
  resumeCommand,
  stopCommand,
  queueCommand,
  removeCommand,
  loopCommand,
  shuffleCommand,
  volumeCommand,
  nowPlayingCommand,
  playlistCommand,
  favoriteCommand,
  historyCommand,
  lyricsCommand,
];

export function buildCommandCollection(): Collection<string, Command> {
  const collection = new Collection<string, Command>();
  for (const command of commandList) {
    collection.set(command.data.name, command);
  }
  return collection;
}
