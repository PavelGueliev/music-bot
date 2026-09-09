import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { infoEmbed } from "../ui/embeds.js";
import { formatDuration, truncate } from "../utils/format.js";

export const historyCommand: Command = {
  data: new SlashCommandBuilder().setName("history").setDescription("Недавно сыгранные треки на этом сервере") as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const recent = ctx.history.recent(interaction.guildId!, 10);
    if (recent.length === 0) {
      await interaction.reply({ embeds: [infoEmbed("История пока пуста.")], ephemeral: true });
      return;
    }
    const lines = recent
      .map((t, i) => `**${i + 1}.** ${truncate(t.title, 60)} \`[${formatDuration(t.durationMs)}]\``)
      .join("\n");
    await interaction.reply({ embeds: [infoEmbed(lines)] });
  },
};
