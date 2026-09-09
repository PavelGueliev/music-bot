import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { infoEmbed } from "../ui/embeds.js";
import type { LoopMode } from "../music/types.js";

export const loopCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Режим повтора")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("off / track / queue")
        .setRequired(true)
        .addChoices(
          { name: "Выключить", value: "off" },
          { name: "Повторять трек", value: "track" },
          { name: "Повторять очередь", value: "queue" }
        )
    ) as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    const mode = interaction.options.getString("mode", true) as LoopMode;
    player!.setLoop(mode);

    const labels: Record<LoopMode, string> = { off: "выключен", track: "трек 🔂", queue: "очередь 🔁" };
    await interaction.reply({ embeds: [infoEmbed(`Режим повтора: **${labels[mode]}**`)] });
  },
};
