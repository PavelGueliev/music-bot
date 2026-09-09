import type { ChatInputCommandInteraction, VoiceBasedChannel } from "discord.js";
import { errorEmbed } from "../ui/embeds.js";
import type { GuildPlayer } from "../music/GuildPlayer.js";

export async function requireVoiceChannel(
  interaction: ChatInputCommandInteraction
): Promise<VoiceBasedChannel | null> {
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  const channel = member?.voice.channel ?? null;
  if (!channel) {
    await interaction.reply({ embeds: [errorEmbed("Сначала зайди в голосовой канал.")], ephemeral: true });
    return null;
  }
  return channel;
}

/** Возвращает true, если у плеера есть что показать/чем управлять; иначе сама отвечает на interaction. */
export async function requireActivePlayer(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer | undefined
): Promise<boolean> {
  if (!player || !player.isConnected || (!player.current && player.queue.length === 0)) {
    await interaction.reply({ embeds: [errorEmbed("Сейчас ничего не играет.")], ephemeral: true });
    return false;
  }
  return true;
}
