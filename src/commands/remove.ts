import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { infoEmbed, errorEmbed } from "../ui/embeds.js";
import { truncate } from "../utils/format.js";

export const removeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Удалить трек из очереди по номеру")
    .addIntegerOption((opt) =>
      opt.setName("position").setDescription("Номер трека в очереди (см. /queue)").setRequired(true).setMinValue(1)
    ) as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    const position = interaction.options.getInteger("position", true);
    const removed = player!.removeAt(position - 1);
    if (!removed) {
      await interaction.reply({ embeds: [errorEmbed("Нет трека с таким номером.")], ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [infoEmbed(`🗑️ Удалено: **${truncate(removed.title, 200)}**`)] });
  },
};
