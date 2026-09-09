import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { infoEmbed, errorEmbed } from "../ui/embeds.js";

export const resumeCommand: Command = {
  data: new SlashCommandBuilder().setName("resume").setDescription("Продолжить воспроизведение") as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    const ok = player!.resume();
    await interaction.reply({
      embeds: [ok ? infoEmbed("▶️ Продолжаю.") : errorEmbed("Не удалось возобновить.")],
    });
  },
};
