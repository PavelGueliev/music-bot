import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { infoEmbed } from "../ui/embeds.js";

export const autoplayCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Когда очередь закончится — сам подбирать похожие треки (как радио в Spotify)")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("on / off")
        .setRequired(true)
        .addChoices({ name: "Включить", value: "on" }, { name: "Выключить", value: "off" })
    ) as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    const enabled = interaction.options.getString("mode", true) === "on";
    player!.setAutoplay(enabled);

    await interaction.reply({
      embeds: [
        infoEmbed(
          enabled
            ? "🔮 Автоплей включён — когда очередь закончится, подберу похожие треки (YouTube Mix от последнего сыгранного)."
            : "Автоплей выключен."
        ),
      ],
    });
  },
};
