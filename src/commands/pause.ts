import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { infoEmbed, errorEmbed } from "../ui/embeds.js";

export const pauseCommand: Command = {
  data: new SlashCommandBuilder().setName("pause").setDescription("Поставить на паузу") as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    const ok = player!.pause();
    await interaction.reply({
      embeds: [ok ? infoEmbed("⏸️ Пауза.") : errorEmbed("Не удалось поставить на паузу.")],
    });
  },
};
