import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { infoEmbed } from "../ui/embeds.js";

export const shuffleCommand: Command = {
  data: new SlashCommandBuilder().setName("shuffle").setDescription("Перемешать очередь") as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    player!.shuffle();
    await interaction.reply({ embeds: [infoEmbed("🔀 Очередь перемешана.")] });
  },
};
