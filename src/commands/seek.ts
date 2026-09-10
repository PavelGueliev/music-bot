import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { requireActivePlayer } from "./helpers.js";
import { infoEmbed, errorEmbed } from "../ui/embeds.js";
import { formatDuration, parseSeekInput } from "../utils/format.js";

export const seekCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Перемотать текущий трек")
    .addStringOption((opt) =>
      opt
        .setName("position")
        .setDescription("Время: 1:30, 90, 1:05:20 — либо относительно: +15, -15")
        .setRequired(true)
    ) as SlashCommandBuilder,

  async execute(interaction, ctx) {
    const player = ctx.queueManager.get(interaction.guildId!);
    if (!(await requireActivePlayer(interaction, player))) return;

    const track = player!.current;
    if (!track) {
      await interaction.reply({ embeds: [errorEmbed("Сейчас ничего не играет.")], ephemeral: true });
      return;
    }

    const target = parseSeekInput(interaction.options.getString("position", true));
    if (!target) {
      await interaction.reply({
        embeds: [errorEmbed("Не понял время. Примеры: `1:30`, `90`, `1:05:20`, `+15`, `-15`.")],
        ephemeral: true,
      });
      return;
    }

    const targetMs =
      target.type === "absolute" ? target.seconds * 1000 : player!.getPositionMs() + target.deltaSeconds * 1000;

    const maxMs = track.durationMs > 1000 ? track.durationMs - 1000 : Number.MAX_SAFE_INTEGER;
    const clampedMs = Math.max(0, Math.min(targetMs, maxMs));

    await interaction.deferReply();
    const ok = await player!.seek(clampedMs);
    if (!ok) {
      await interaction.editReply({ embeds: [errorEmbed("Не удалось перемотать этот трек.")] });
      return;
    }

    const durationSuffix = track.durationMs > 0 ? ` / ${formatDuration(track.durationMs)}` : "";
    await interaction.editReply({
      embeds: [infoEmbed(`⏩ Перемотано на **${formatDuration(clampedMs)}**${durationSuffix}`)],
    });
  },
};
