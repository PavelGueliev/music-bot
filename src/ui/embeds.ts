import { EmbedBuilder } from "discord.js";
import { formatDuration, progressBar, truncate } from "../utils/format.js";
import type { LoopMode, Track } from "../music/types.js";

const COLOR = 0x1db954; // спотифай-зелёный, чисто эстетика

export function nowPlayingEmbed(track: Track, loopMode: LoopMode, volume: number, queueLength: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: "Сейчас играет" })
    .setTitle(truncate(track.title, 256))
    .setURL(track.url)
    .setThumbnail(track.thumbnail ?? null)
    .setDescription(`${progressBar(0, track.durationMs)}  \`${formatDuration(track.durationMs)}\``)
    .addFields(
      { name: "Повтор", value: loopLabel(loopMode), inline: true },
      { name: "Громкость", value: `${Math.round(volume * 100)}%`, inline: true },
      { name: "В очереди", value: String(queueLength), inline: true }
    )
    .setFooter(track.requestedBy ? { text: `Добавил: ${track.requestedBy}` } : null);
}

export function queueEmbed(current: Track | null, queue: Track[], page = 0, pageSize = 10): EmbedBuilder {
  const start = page * pageSize;
  const slice = queue.slice(start, start + pageSize);
  const lines = slice.map(
    (t, i) => `**${start + i + 1}.** ${truncate(t.title, 60)} \`[${formatDuration(t.durationMs)}]\``
  );

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("Очередь воспроизведения")
    .setDescription(lines.length ? lines.join("\n") : "Очередь пуста");

  if (current) {
    embed.addFields({
      name: "Сейчас играет",
      value: `${truncate(current.title, 80)} \`[${formatDuration(current.durationMs)}]\``,
    });
  }
  if (queue.length > pageSize) {
    embed.setFooter({ text: `Стр. ${page + 1} из ${Math.ceil(queue.length / pageSize)} · всего треков: ${queue.length}` });
  }
  return embed;
}

export function trackAddedEmbed(track: Track, position: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setDescription(`✅ Добавлено в очередь (позиция **${position}**): **${truncate(track.title, 200)}**`)
    .setThumbnail(track.thumbnail ?? null);
}

export function infoEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLOR).setDescription(text);
}

export function errorEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${text}`);
}

function loopLabel(mode: LoopMode): string {
  switch (mode) {
    case "track": return "🔂 Трек";
    case "queue": return "🔁 Очередь";
    default: return "➡️ Выкл.";
  }
}
