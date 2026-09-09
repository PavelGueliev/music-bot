import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { LoopMode } from "../music/types.js";

export const BUTTON_PREFIX = "player";

export type PlayerAction = "pause" | "resume" | "skip" | "stop" | "loop" | "shuffle" | "like";

export function buildCustomId(action: PlayerAction, guildId: string): string {
  return `${BUTTON_PREFIX}:${action}:${guildId}`;
}

export function parseCustomId(customId: string): { action: PlayerAction; guildId: string } | null {
  const [prefix, action, guildId] = customId.split(":");
  if (prefix !== BUTTON_PREFIX || !action || !guildId) return null;
  return { action: action as PlayerAction, guildId };
}

export function playerControlsRow(guildId: string, isPaused: boolean, loopMode: LoopMode) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(isPaused ? "resume" : "pause", guildId))
      .setEmoji(isPaused ? "▶️" : "⏸️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildCustomId("skip", guildId))
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildCustomId("stop", guildId))
      .setEmoji("⏹️")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(buildCustomId("loop", guildId))
      .setEmoji("🔁")
      .setStyle(loopMode === "off" ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildCustomId("shuffle", guildId))
      .setEmoji("🔀")
      .setStyle(ButtonStyle.Secondary)
  );
}
