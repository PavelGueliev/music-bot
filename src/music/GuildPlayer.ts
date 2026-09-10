import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import { EventEmitter } from "node:events";
import type { VoiceBasedChannel } from "discord.js";
import { env } from "../config/env.js";
import { childLogger } from "../utils/logger.js";
import { createPlayback, type PlaybackHandle } from "./AudioPipeline.js";
import { getRelatedTracks } from "./sources/ytdlp.js";
import type { LoopMode, Track } from "./types.js";

const logger = childLogger("guild-player");

export interface GuildPlayerEvents {
  trackStart: [track: Track];
  trackError: [track: Track, error: unknown];
  queueEmpty: [];
  disconnected: [];
}

/**
 * Один экземпляр на гильдию, полностью изолированный от остальных: очередь,
 * соединение и таймеры не пересекаются, поэтому сбой в одном сервере
 * (битое видео, потеря сети) не может "заморозить" музыку в других.
 */
export class GuildPlayer extends EventEmitter {
  readonly guildId: string;
  private connection: VoiceConnection | null = null;
  private readonly audioPlayer: AudioPlayer;
  private currentHandle: PlaybackHandle | null = null;

  /** Канал, куда слать сообщения "сейчас играет" — обновляется последней использованной командой. */
  textChannelId: string | null = null;
  current: Track | null = null;
  queue: Track[] = [];
  history: Track[] = [];
  loopMode: LoopMode = "off";
  volume = env.DEFAULT_VOLUME / 100;
  /** Автоплей: когда очередь заканчивается, сам подбираем похожие треки (YouTube Mix) — аналог радио в Spotify. */
  autoplay = false;

  private skipRequested = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private emptyChannelTimer: NodeJS.Timeout | null = null;

  constructor(guildId: string) {
    super();
    this.guildId = guildId;
    this.audioPlayer = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    this.wireAudioPlayerEvents();
  }

  private wireAudioPlayerEvents(): void {
    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      this.currentHandle?.destroy();
      this.currentHandle = null;
      void this.handleTrackFinished();
    });

    this.audioPlayer.on("error", (error) => {
      const track = this.current;
      logger.error({ error, guildId: this.guildId, track: track?.title }, "Ошибка воспроизведения");
      if (track) this.emit("trackError", track, error);
      this.currentHandle?.destroy();
      this.currentHandle = null;
      void this.handleTrackFinished();
    });
  }

  async connect(channel: VoiceBasedChannel): Promise<void> {
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    this.connection.subscribe(this.audioPlayer);

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection!, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });

    await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
  }

  get isConnected(): boolean {
    return this.connection !== null && this.connection.state.status !== VoiceConnectionStatus.Destroyed;
  }

  enqueue(tracks: Track[]): void {
    const room = Math.max(env.MAX_QUEUE_SIZE - this.queue.length, 0);
    this.queue.push(...tracks.slice(0, room));
    this.cancelIdleTimer();
    if (this.audioPlayer.state.status === AudioPlayerStatus.Idle && !this.current) {
      void this.playNext();
    }
  }

  private async playNext(): Promise<void> {
    const next = this.queue.shift();
    if (!next) {
      this.current = null;
      this.emit("queueEmpty");
      this.scheduleIdleDisconnect();
      return;
    }

    this.current = next;
    try {
      const handle = await createPlayback(next);
      this.currentHandle = handle;
      handle.resource.volume?.setVolume(this.volume);
      this.audioPlayer.play(handle.resource);
      this.emit("trackStart", next);
    } catch (error) {
      logger.error({ error, track: next.title }, "Не удалось запустить трек, пропускаю");
      this.emit("trackError", next, error);
      void this.playNext();
    }
  }

  private async handleTrackFinished(): Promise<void> {
    const finished = this.current;
    const wasSkip = this.skipRequested;
    this.skipRequested = false;

    if (finished) {
      this.history.unshift(finished);
      this.history = this.history.slice(0, 20);

      if (!wasSkip && this.loopMode === "track") {
        this.queue.unshift(finished);
      } else if (this.loopMode === "queue") {
        this.queue.push(finished);
      }
    }

    // Автоплей подбирает следующую порцию от ПОСЛЕДНЕГО реально сыгранного
    // трека (а не от исходного семени плейлиста) — так подборка естественно
    // "дрейфует" по смыслу вслед за тем, что действительно звучало, как
    // радио в Spotify, а не залипает на одной теме навсегда.
    if (this.autoplay && this.queue.length === 0 && finished) {
      await this.fetchAutoplayTracks(finished);
    }

    await this.playNext();
  }

  private async fetchAutoplayTracks(seed: Track): Promise<void> {
    try {
      const related = await getRelatedTracks(seed.url, 5);
      // Пока ждали сеть, могли выключить автоплей или уже добавить треки
      // вручную — не подмешиваем автоплей задним числом поверх этого.
      if (!this.autoplay || this.queue.length > 0 || related.length === 0) return;
      this.queue.push(...related.map((t) => ({ ...t, requestedBy: "🔮 Автоплей" })));
      logger.debug({ guildId: this.guildId, count: related.length, seed: seed.title }, "Автоплей добавил треки");
    } catch (error) {
      logger.warn({ error, guildId: this.guildId, seed: seed.title }, "Автоплей: не удалось подобрать треки");
    }
  }

  skip(): void {
    this.skipRequested = true;
    this.audioPlayer.stop(true);
  }

  pause(): boolean {
    return this.audioPlayer.pause();
  }

  resume(): boolean {
    return this.audioPlayer.unpause();
  }

  get isPaused(): boolean {
    return this.audioPlayer.state.status === AudioPlayerStatus.Paused;
  }

  setVolume(percent: number): void {
    this.volume = Math.max(0, percent) / 100;
    this.currentHandle?.resource.volume?.setVolume(this.volume);
  }

  setLoop(mode: LoopMode): void {
    this.loopMode = mode;
  }

  setAutoplay(enabled: boolean): void {
    this.autoplay = enabled;
  }

  shuffle(): void {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j]!, this.queue[i]!];
    }
  }

  removeAt(index: number): Track | null {
    if (index < 0 || index >= this.queue.length) return null;
    return this.queue.splice(index, 1)[0] ?? null;
  }

  clearQueue(): void {
    this.queue = [];
  }

  stop(): void {
    this.clearQueue();
    this.loopMode = "off";
    this.skipRequested = true;
    this.audioPlayer.stop(true);
  }

  /** Ставит паузу-на-отключение, если бот один в канале — отменяется, если кто-то зайдёт. */
  scheduleEmptyChannelLeave(minutes: number): void {
    this.cancelEmptyChannelTimer();
    this.emptyChannelTimer = setTimeout(() => this.destroy(), minutes * 60_000);
  }

  cancelEmptyChannelTimer(): void {
    if (this.emptyChannelTimer) {
      clearTimeout(this.emptyChannelTimer);
      this.emptyChannelTimer = null;
    }
  }

  private scheduleIdleDisconnect(): void {
    if (env.IDLE_LEAVE_MINUTES <= 0) return;
    this.cancelIdleTimer();
    this.idleTimer = setTimeout(() => this.destroy(), env.IDLE_LEAVE_MINUTES * 60_000);
  }

  private cancelIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /** Полная остановка и освобождение всех ресурсов — обязателен явный вызов, иначе утечёт ffmpeg-процесс/соединение. */
  destroy(): void {
    this.cancelIdleTimer();
    this.cancelEmptyChannelTimer();
    this.currentHandle?.destroy();
    this.currentHandle = null;
    this.queue = [];
    this.current = null;
    this.audioPlayer.stop(true);
    this.audioPlayer.removeAllListeners();
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }
    this.connection = null;
    this.emit("disconnected");
  }
}
