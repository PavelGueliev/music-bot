import { Client, Events, GatewayIntentBits } from "discord.js";
import { env } from "../config/env.js";
import { childLogger } from "../utils/logger.js";
import { buildCommandCollection } from "../commands/index.js";
import type { AppContext } from "./context.js";
import { nowPlayingEmbed, errorEmbed } from "../ui/embeds.js";
import { playerControlsRow, parseCustomId } from "../ui/buttons.js";
import type { GuildPlayer } from "../music/GuildPlayer.js";
import type { Track } from "../music/types.js";

const logger = childLogger("client");

export function createClient(ctx: AppContext): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  const commands = buildCommandCollection();

  // Каждый новый GuildPlayer сразу получает общие обработчики — не нужно
  // помнить об этом в каждой команде, которая может его создать.
  ctx.queueManager.on("created", (player: GuildPlayer) => wireGuildPlayer(client, ctx, player));

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Бот запущен");
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, ctx);
        return;
      }

      if (interaction.isAutocomplete()) {
        const command = commands.get(interaction.commandName);
        if (!command?.autocomplete) return;
        await command.autocomplete(interaction, ctx);
        return;
      }

      if (interaction.isButton()) {
        await handleButton(interaction, ctx);
        return;
      }
    } catch (error) {
      logger.error({ error, interactionType: interaction.type }, "Ошибка обработки interaction");
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ embeds: [errorEmbed("Произошла ошибка при выполнении команды.")], ephemeral: true })
          .catch(() => undefined);
      }
    }
  });

  // Автоотключение, если бота оставили одного в голосовом канале —
  // освобождаем соединение и процессы, а не висим просто так.
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const guildId = oldState.guild.id ?? newState.guild.id;
    const player = ctx.queueManager.get(guildId);
    if (!player || !player.isConnected) return;

    const botVoiceChannel = oldState.guild.members.me?.voice.channel;
    if (!botVoiceChannel) return;

    const humansInChannel = botVoiceChannel.members.filter((m) => !m.user.bot).size;
    if (humansInChannel === 0) {
      player.scheduleEmptyChannelLeave(env.IDLE_LEAVE_MINUTES || 1);
    } else {
      player.cancelEmptyChannelTimer();
    }
  });

  return client;
}

function wireGuildPlayer(client: Client, ctx: AppContext, player: GuildPlayer): void {
  player.on("trackStart", async (track: Track) => {
    if (track.requestedById) {
      ctx.history.record(player.guildId, track.requestedById, track);
    }
    await postNowPlaying(client, player, track);
  });

  player.on("trackError", (track: Track, error: unknown) => {
    logger.warn({ track: track.title, error }, "Ошибка трека, пропускаю дальше");
    void notifyTrackError(client, player, track);
  });
}

async function notifyTrackError(client: Client, player: GuildPlayer, track: Track): Promise<void> {
  if (!player.textChannelId) return;
  try {
    const channel = await client.channels.fetch(player.textChannelId);
    if (!channel || !channel.isSendable()) return;
    await channel.send({ embeds: [errorEmbed(`Не удалось воспроизвести «${track.title}», пропускаю дальше.`)] });
  } catch (error) {
    logger.warn({ error, guildId: player.guildId }, "Не удалось отправить сообщение об ошибке трека");
  }
}

async function postNowPlaying(client: Client, player: GuildPlayer, track: Track): Promise<void> {
  if (!player.textChannelId) return;
  try {
    const channel = await client.channels.fetch(player.textChannelId);
    if (!channel || !channel.isSendable()) return;
    await channel.send({
      embeds: [nowPlayingEmbed(track, player.loopMode, player.volume, player.queue.length, player.autoplay)],
      components: [playerControlsRow(player.guildId, player.isPaused, player.loopMode)],
    });
  } catch (error) {
    logger.warn({ error, guildId: player.guildId }, "Не удалось отправить сообщение 'сейчас играет'");
  }
}

async function handleButton(interaction: import("discord.js").ButtonInteraction, ctx: AppContext): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  const player = ctx.queueManager.get(parsed.guildId);
  if (!player) {
    await interaction.reply({ embeds: [errorEmbed("Плеер уже неактивен.")], ephemeral: true });
    return;
  }

  switch (parsed.action) {
    case "pause":
      player.pause();
      break;
    case "resume":
      player.resume();
      break;
    case "skip":
      player.skip();
      break;
    case "stop":
      player.destroy();
      break;
    case "loop": {
      const order: Array<GuildPlayer["loopMode"]> = ["off", "track", "queue"];
      const next = order[(order.indexOf(player.loopMode) + 1) % order.length]!;
      player.setLoop(next);
      break;
    }
    case "shuffle":
      player.shuffle();
      break;
    case "like":
      if (player.current) ctx.favorites.add(interaction.user.id, player.current);
      break;
  }

  if (!player.current) {
    await interaction.update({ embeds: [errorEmbed("Воспроизведение остановлено.")], components: [] }).catch(() => undefined);
    return;
  }

  await interaction
    .update({
      embeds: [nowPlayingEmbed(player.current, player.loopMode, player.volume, player.queue.length, player.autoplay)],
      components: [playerControlsRow(player.guildId, player.isPaused, player.loopMode)],
    })
    .catch(() => undefined);
}
