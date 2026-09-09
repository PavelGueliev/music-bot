import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { infoEmbed } from "../ui/embeds.js";

export const volumeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Установить громкость (0-200%)")
    .addIntegerOption((opt) =>
      opt.setName("percent").setDescription("Проценты").setRequired(true).setMinValue(0).setMaxValue(200)
    ) as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    const percent = interaction.options.getInteger("percent", true);
    player!.setVolume(percent);
    await interaction.reply({ embeds: [infoEmbed(`🔊 Громкость: **${percent}%**`)] });
  },
};
