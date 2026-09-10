import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { nowPlayingEmbed, errorEmbed } from "../ui/embeds.js";
import { playerControlsRow } from "../ui/buttons.js";

export const nowPlayingCommand: Command = {
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("Что сейчас играет") as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    if (!player!.current) {
      await interaction.reply({ embeds: [errorEmbed("Сейчас ничего не играет.")], ephemeral: true });
      return;
    }

    await interaction.reply({
      embeds: [nowPlayingEmbed(player!.current, player!.loopMode, player!.volume, player!.queue.length, player!.autoplay)],
      components: [playerControlsRow(interaction.guildId!, player!.isPaused, player!.loopMode)],
    });
  },
};
