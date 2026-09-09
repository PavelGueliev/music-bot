import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { queueEmbed } from "../ui/embeds.js";

export const queueCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Показать очередь")
    .addIntegerOption((opt) => opt.setName("page").setDescription("Номер страницы").setMinValue(1)) as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    const page = (interaction.options.getInteger("page") ?? 1) - 1;
    await interaction.reply({ embeds: [queueEmbed(player!.current, player!.queue, Math.max(page, 0))] });
  },
};
