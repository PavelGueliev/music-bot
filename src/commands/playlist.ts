import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireVoiceChannel } from "./helpers.js";
import { infoEmbed, errorEmbed } from "../ui/embeds.js";
import { resolveQuery } from "../music/resolveQuery.js";
import { truncate } from "../utils/format.js";
import { childLogger } from "../utils/logger.js";

const logger = childLogger("cmd-playlist");

export const playlistCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Управление персональными плейлистами")
    .addSubcommand((sub) =>
      sub
        .setName("save")
        .setDescription("Сохранить текущую очередь этого сервера как плейлист")
        .addStringOption((opt) => opt.setName("name").setDescription("Имя плейлиста").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("load")
        .setDescription("Загрузить плейлист в очередь")
        .addStringOption((opt) => opt.setName("name").setDescription("Имя плейлиста").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Список твоих плейлистов")
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Удалить плейлист")
        .addStringOption((opt) => opt.setName("name").setDescription("Имя плейлиста").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Добавить трек в существующий плейлист")
        .addStringOption((opt) => opt.setName("name").setDescription("Имя плейлиста").setRequired(true).setAutocomplete(true))
        .addStringOption((opt) => opt.setName("query").setDescription("Название или ссылка трека").setRequired(true))
    ) as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "list") {
      const playlists = ctx.playlists.list(userId);
      if (playlists.length === 0) {
        await interaction.reply({ embeds: [infoEmbed("У тебя пока нет сохранённых плейлистов.")], ephemeral: true });
        return;
      }
      const lines = playlists.map((p) => `• **${p.name}**`).join("\n");
      await interaction.reply({ embeds: [infoEmbed(lines)], ephemeral: true });
      return;
    }

    if (sub === "save") {
      const name = interaction.options.getString("name", true);
      const player = ctx.queueManager.get(interaction.guildId!);
      const tracks = [...(player?.current ? [player.current] : []), ...(player?.queue ?? [])];
      if (tracks.length === 0) {
        await interaction.reply({ embeds: [errorEmbed("Очередь пуста — нечего сохранять.")], ephemeral: true });
        return;
      }
      const playlist = ctx.playlists.find(userId, name) ?? ctx.playlists.create(userId, name);
      ctx.playlists.saveTracks(playlist.id, tracks);
      await interaction.reply({ embeds: [infoEmbed(`💾 Сохранено **${tracks.length}** треков в плейлист **${name}**`)] });
      return;
    }

    if (sub === "load") {
      const name = interaction.options.getString("name", true);
      const playlist = ctx.playlists.find(userId, name);
      if (!playlist) {
        await interaction.reply({ embeds: [errorEmbed("Плейлист не найден.")], ephemeral: true });
        return;
      }
      const channel = await requireVoiceChannel(interaction);
      if (!channel) return;

      await interaction.deferReply();
      const tracks = ctx.playlists
        .getTracks(playlist.id)
        .map((t) => ({ ...t, requestedBy: interaction.user.username, requestedById: interaction.user.id }));
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
      player.enqueue(tracks);
      await interaction.editReply({ embeds: [infoEmbed(`▶️ Загружено **${tracks.length}** треков из плейлиста **${name}**`)] });
      return;
    }

    if (sub === "delete") {
      const name = interaction.options.getString("name", true);
      const playlist = ctx.playlists.find(userId, name);
      if (!playlist) {
        await interaction.reply({ embeds: [errorEmbed("Плейлист не найден.")], ephemeral: true });
        return;
      }
      ctx.playlists.delete(playlist.id);
      await interaction.reply({ embeds: [infoEmbed(`🗑️ Плейлист **${name}** удалён.`)] });
      return;
    }

    if (sub === "add") {
      const name = interaction.options.getString("name", true);
      const query = interaction.options.getString("query", true);
      const playlist = ctx.playlists.find(userId, name);
      if (!playlist) {
        await interaction.reply({ embeds: [errorEmbed("Плейлист не найден.")], ephemeral: true });
        return;
      }
      await interaction.deferReply();
      const found = await resolveQuery(query, interaction.user.username, interaction.user.id);
      if (found.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed("Ничего не найдено.")] });
        return;
      }
      const existing = ctx.playlists.getTracks(playlist.id);
      ctx.playlists.saveTracks(playlist.id, [...existing, ...found]);
      await interaction.editReply({ embeds: [infoEmbed(`✅ Добавлено в **${name}**: ${truncate(found[0]!.title, 100)}`)] });
      return;
    }
  },

  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused().toLowerCase();
    const playlists = ctx.playlists.list(interaction.user.id);
    await interaction.respond(
      playlists
        .filter((p) => p.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((p) => ({ name: p.name, value: p.name }))
    );
  },
};
