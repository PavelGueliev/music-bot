import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { infoEmbed } from "../ui/embeds.js";
import { truncate } from "../utils/format.js";

export const skipCommand: Command = {
  data: new SlashCommandBuilder().setName("skip").setDescription("Пропустить текущий трек") as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    const skipped = player!.current;
    player!.skip();
    await interaction.reply({ embeds: [infoEmbed(`⏭️ Пропущено: **${truncate(skipped?.title ?? "трек", 200)}**`)] });
  },
};
