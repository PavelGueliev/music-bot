import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import type { Command } from "./types.js";
import { errorEmbed } from "../ui/embeds.js";
import { config } from "../config/env.js";
import { findLyrics } from "../services/lyrics.js";
import { childLogger } from "../utils/logger.js";

const logger = childLogger("cmd-lyrics");

export const lyricsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("Найти текст песни (Genius)")
    .addStringOption((opt) =>
      opt.setName("query").setDescription("Название песни (по умолчанию — текущий трек)")
    ) as SlashCommandBuilder,

  async execute(interaction, ctx) {
    if (!config.geniusEnabled) {
      await interaction.reply({ embeds: [errorEmbed("Функция текстов песен не настроена на этом боте.")], ephemeral: true });
      return;
    }

    const explicitQuery = interaction.options.getString("query");
    const current = ctx.queueManager.get(interaction.guildId!)?.current;
    const query = explicitQuery ?? current?.title;

    if (!query) {
      await interaction.reply({ embeds: [errorEmbed("Укажи название песни или запусти воспроизведение.")], ephemeral: true });
      return;
    }

    await interaction.deferReply();
    try {
      const result = await findLyrics(query);
      if (!result) {
        await interaction.editReply({ embeds: [errorEmbed("Текст не найден.")] });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x1db954)
        .setTitle(`${result.artist} — ${result.title}`)
        .setURL(result.geniusUrl)
        .setDescription(`${result.preview}\n\n[Полный текст на Genius](${result.geniusUrl})`);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error({ error, query }, "Ошибка поиска текста песни");
      await interaction.editReply({ embeds: [errorEmbed("Не удалось получить текст песни.")] });
    }
  },
};
