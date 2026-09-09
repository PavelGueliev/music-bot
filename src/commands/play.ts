import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireVoiceChannel } from "./helpers.js";
import { resolveQuery } from "../music/resolveQuery.js";
import { infoEmbed, errorEmbed, trackAddedEmbed } from "../ui/embeds.js";
import { truncate } from "../utils/format.js";
import { childLogger } from "../utils/logger.js";

const logger = childLogger("cmd-play");

export const playCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Найти и включить трек (YouTube, ссылка на видео/плейлист или Spotify)")
    .addStringOption((opt) =>
      opt.setName("query").setDescription("Название, ссылка YouTube или ссылка Spotify").setRequired(true).setAutocomplete(true)
    ) as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const channel = await requireVoiceChannel(interaction);
    if (!channel) return;

    await interaction.deferReply();

    const query = interaction.options.getString("query", true);
    let tracks;
    try {
      tracks = await resolveQuery(query, interaction.user.username, interaction.user.id);
    } catch (error) {
      logger.error({ error, query }, "Ошибка резолва запроса");
      await interaction.editReply({ embeds: [errorEmbed("Не удалось найти или обработать запрос.")] });
      return;
    }

    if (tracks.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed("Ничего не найдено.")] });
      return;
    }

    const player = ctx.queueManager.getOrCreate(interaction.guildId!);
    player.textChannelId = interaction.channelId;

    if (!player.isConnected) {
      try {
        await player.connect(channel);
      } catch (error) {
        logger.error({ error }, "Не удалось подключиться к голосовому каналу");
        await interaction.editReply({ embeds: [errorEmbed("Не удалось подключиться к голосовому каналу.")] });
        return;
      }
    }

    const positionOfFirst = player.queue.length + (player.current ? 1 : 0) + 1;
    const willStartImmediately = !player.current && player.queue.length === 0;
    player.enqueue(tracks);

    if (tracks.length > 1) {
      await interaction.editReply({
        embeds: [infoEmbed(`✅ Добавлено в очередь **${tracks.length}** треков (первый: ${truncate(tracks[0]!.title, 100)})`)],
      });
      return;
    }

    const track = tracks[0]!;
    if (willStartImmediately) {
      // "Сейчас играет" отправится отдельным сообщением через событие trackStart, как только реально начнётся.
      await interaction.editReply({ embeds: [infoEmbed(`▶️ Включаю: **${truncate(track.title, 200)}**`)] });
      return;
    }

    await interaction.editReply({ embeds: [trackAddedEmbed(track, positionOfFirst)] });
  },

  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused().trim().toLowerCase();
    const guildId = interaction.guildId;

    const favorites = ctx.favorites.list(interaction.user.id);
    const recent = guildId ? ctx.history.recent(guildId, 15) : [];

    const seen = new Set<string>();
    const suggestions = [...favorites, ...recent].filter((t) => {
      if (seen.has(t.url)) return false;
      seen.add(t.url);
      return focused.length === 0 || t.title.toLowerCase().includes(focused);
    });

    await interaction.respond(
      suggestions.slice(0, 25).map((t) => ({ name: truncate(t.title, 100), value: truncate(t.title, 100) }))
    );
  },
};
