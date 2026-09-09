import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { infoEmbed, errorEmbed } from "../ui/embeds.js";
import { formatDuration, truncate } from "../utils/format.js";

export const favoriteCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("favorite")
    .setDescription("Избранные треки")
    .addSubcommand((sub) => sub.setName("add").setDescription("Добавить текущий трек в избранное"))
    .addSubcommand((sub) => sub.setName("remove").setDescription("Убрать текущий трек из избранного"))
    .addSubcommand((sub) => sub.setName("list").setDescription("Список избранных треков")) as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const favorites = ctx.favorites.list(interaction.user.id);
      if (favorites.length === 0) {
        await interaction.reply({ embeds: [infoEmbed("Избранное пусто.")], ephemeral: true });
        return;
      }
      const lines = favorites
        .slice(0, 25)
        .map((t, i) => `**${i + 1}.** ${truncate(t.title, 60)} \`[${formatDuration(t.durationMs)}]\``)
        .join("\n");
      await interaction.reply({ embeds: [infoEmbed(lines)], ephemeral: true });
      return;
    }

    const player = ctx.queueManager.get(interaction.guildId!);
    const current = player?.current;
    if (!current) {
      await interaction.reply({ embeds: [errorEmbed("Сейчас ничего не играет.")], ephemeral: true });
      return;
    }

    if (sub === "add") {
      ctx.favorites.add(interaction.user.id, current);
      await interaction.reply({ embeds: [infoEmbed(`❤️ Добавлено в избранное: **${truncate(current.title, 200)}**`)], ephemeral: true });
      return;
    }

    if (sub === "remove") {
      ctx.favorites.remove(interaction.user.id, current.url);
      await interaction.reply({ embeds: [infoEmbed(`💔 Убрано из избранного: **${truncate(current.title, 200)}**`)], ephemeral: true });
      return;
    }
  },
};
