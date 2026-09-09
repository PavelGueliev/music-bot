import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { infoEmbed } from "../ui/embeds.js";

export const stopCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Остановить воспроизведение, очистить очередь и выйти из канала") as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    player!.destroy();
    await interaction.reply({ embeds: [infoEmbed("⏹️ Остановлено, очередь очищена, вышел из канала.")] });
  },
};
