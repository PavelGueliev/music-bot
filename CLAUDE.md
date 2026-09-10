# Music Bot — карта проекта

Discord-бот с функциями в духе Spotify (поиск/очередь/плейлисты/избранное/
история/тексты песен). Ключевое ограничение проекта: **работает на 1 ядре
CPU и не должен зависать** — почти все решения ниже продиктованы этим.

Стек: Node.js 22+ / TypeScript (ESM, `NodeNext`), discord.js v14,
`@discordjs/voice`, `better-sqlite3`, реальный звук — YouTube через
`yt-dlp` + `ffmpeg` (см. "Почему так" в [README.md](README.md), там же —
пошаговый запуск через Docker/локально).

Этот файл — не про "как запустить", а про "что где лежит и как это
работает вместе", чтобы не пересобирать контекст с нуля.

## Поток данных верхнего уровня

```
Discord interaction
   │
   ▼
src/bot/client.ts (InteractionCreate) ──► commands/*.ts (execute/autocomplete)
   │                                            │
   │                                            ▼
   │                                   AppContext (bot/context.ts):
   │                                   queueManager, playlists, favorites, history
   │
   ▼
QueueManager.getOrCreate(guildId) ──► GuildPlayer (music/GuildPlayer.ts)
                                            │
                                            ▼
                                   AudioPipeline.createPlayback(track)
                                            │
                              yt-dlp (resolveStreamUrl) → ffmpeg (spawn, читает URL напрямую)
                                            │
                                            ▼
                              @discordjs/voice AudioResource (PCM→Opus, inline volume)
```

Когда трек реально начинает играть, `GuildPlayer` эмитит `trackStart` →
`bot/client.ts` ловит это (подписка вешается один раз на КАЖДЫЙ новый
плеер через событие `QueueManager#created`) → шлёт embed "сейчас играет" +
кнопки в `player.textChannelId` (канал последней использованной команды)
и пишет запись в `history`.

## Карта файлов

### Вход и связка
- [src/index.ts](src/index.ts) — точка входа: создаёт контекст и клиент, логинится, graceful shutdown по SIGINT/SIGTERM (убивает все GuildPlayer → ffmpeg-процессы → закрывает БД).
- [src/bot/client.ts](src/bot/client.ts) — единственное место, где создаётся discord.js `Client`. Роутинг interaction'ов (chat input / autocomplete / button), обработчик `VoiceStateUpdate` (авто-выход при пустом канале), подписка на события каждого нового `GuildPlayer`.
- [src/bot/context.ts](src/bot/context.ts) — `AppContext`: то, что прокидывается в каждую команду (`queueManager`, `playlists`, `favorites`, `history`). Если добавляешь новый общий сервис — регистрируй здесь.
- [src/config/env.ts](src/config/env.ts) — валидация `.env` через zod, падает с понятной ошибкой при старте, а не посреди работы. `config.spotifyEnabled` / `config.geniusEnabled` — флаги для опциональных интеграций.

### Музыкальный движок (`src/music/`)
- [GuildPlayer.ts](src/music/GuildPlayer.ts) — **сердце бота**. Один экземпляр на гильдию. Держит очередь, `AudioPlayer` из `@discordjs/voice`, loop-режим, громкость, in-memory историю (для будущего "previous"), идле-таймеры. Публичные методы — `enqueue/skip/pause/resume/setVolume/setLoop/shuffle/removeAt/stop/destroy`. `destroy()` — единственный корректный способ полностью освободить ресурсы (ffmpeg, voice connection, таймеры).
- [QueueManager.ts](src/music/QueueManager.ts) — реестр `GuildPlayer` по `guildId`, создаёт лениво, эмитит `"created"` (на это подписывается `client.ts`), удаляет из реестра по `"disconnected"`.
- [AudioPipeline.ts](src/music/AudioPipeline.ts) — на входе `Track`, на выходе `AudioResource` + `destroy()`. Резолвит прямой URL через yt-dlp, спавнит ffmpeg, который читает этот URL напрямую по HTTP (без второго процесса и без временных файлов) и отдаёт raw PCM → `@discordjs/voice` сам кодирует в Opus нативно.
- [resolveQuery.ts](src/music/resolveQuery.ts) — единая точка входа для "текст/ссылка → `Track[]`", используется и в `/play`, и в `/playlist add`. Разруливает 3 кейса: URL YouTube, URL Spotify (через `sources/spotify.ts`), обычный текст (поиск + LRU-кэш).
- [types.ts](src/music/types.ts) — `Track`, `LoopMode`, `ResolvedStream`. Если меняешь форму `Track` — задеваешь репозитории (`db/repositories/*`) и `ui/embeds.ts`.
- `sources/ytdlp.ts` — весь контакт с бинарником `yt-dlp` (search / resolveFromUrl / resolveStreamUrl), каждый вызов с жёстким таймаутом (`execFile`), чтобы битое видео не подвесило бота. `withCookies()` автоматически добавляет `--cookies $YTDLP_COOKIES_FILE` во все вызовы, если переменная задана (нужно для возрастных видео) — не забыть про неё при добавлении новых вызовов yt-dlp.
- `sources/spotify.ts` — Client Credentials flow к Spotify Web API, **только метаданные**, аудио не отдаёт (см. врезку в README, почему). Возвращает поисковые строки, которые дальше ищутся на YouTube.
- `cache/searchCache.ts` — LRU (10 мин, 300 записей) для результатов текстового поиска.

### Данные (`src/db/`)
- `database.ts` — инициализация `better-sqlite3`, WAL-режим, применяет `schema.sql` при каждом старте (idempotent `CREATE TABLE IF NOT EXISTS`).
- `schema.sql` — 4 таблицы: `playlists`, `playlist_tracks`, `favorites`, `history`. **Важно:** при `npm run build` этот файл копируется в `dist/db/schema.sql` отдельной командой (TS его не копирует сам) — если добавляешь ещё нетс/статические ассеты, не забудь про build-скрипт в `package.json`.
- `repositories/playlistRepository.ts`, `favoriteRepository.ts`, `historyRepository.ts` — вся SQL-логика, prepared statements переиспользуются (не пересоздаются на каждый вызов). `historyRepository` сам подрезает себя до 100 записей на гильдию.

### UI-хелперы (`src/ui/`)
- `embeds.ts` — все `EmbedBuilder` (nowPlaying/queue/trackAdded/info/error). Цвет — спотифай-зелёный `0x1db954`.
- `buttons.ts` — кнопки под now-playing (`pause/resume/skip/stop/loop/shuffle`), `customId` формата `player:<action>:<guildId>`, парсится в `client.ts`.

### Команды (`src/commands/`)
Каждый файл экспортирует объект `Command` (`{ data, execute, autocomplete? }`), интерфейс — в `types.ts`. Общая регистрация — `index.ts` (`commandList` + `buildCommandCollection`). Общие гварды — `helpers.ts` (`requireVoiceChannel`, `requireActivePlayer`).

| Команда | Файл | Суть |
|---|---|---|
| `/play` | play.ts | поиск/URL/Spotify → в очередь; автодополнение из избранного+истории (не живой поиск — намеренно, ради скорости) |
| `/skip` `/pause` `/resume` `/stop` | skip.ts, pause.ts, resume.ts, stop.ts | базовое управление |
| `/queue` `/remove` | queue.ts, remove.ts | просмотр/удаление из очереди |
| `/loop` `/shuffle` `/volume` | loop.ts, shuffle.ts, volume.ts | режимы воспроизведения |
| `/nowplaying` | nowplaying.ts | карточка + кнопки по запросу |
| `/playlist save\|load\|list\|delete\|add` | playlist.ts | персональные плейлисты в sqlite, с автодополнением по имени |
| `/favorite add\|remove\|list` | favorite.ts | избранное (привязано к текущему играющему треку) |
| `/history` | history.ts | последние 10 треков на сервере |
| `/lyrics` | lyrics.ts | превью текста (не полный, из-за авторских прав) + ссылка на Genius |

### Прочее
- `src/services/lyrics.ts` — Genius: поиск метаданных через официальный API + best-effort парсинг превью текста прямо со страницы (регэксп по `data-lyrics-container`, может сломаться при редизайне Genius — это единственное действительно хрупкое место в проекте).
- `src/utils/format.ts` — `formatDuration`, `progressBar`, `truncate`, `isUrl`.
- `src/utils/logger.ts` — `pino`, дочерние логгеры через `childLogger(scope)`.
- `scripts/deploy-commands.ts` — регистрация slash-команд (гильдийная при заданном `DISCORD_DEV_GUILD_ID` — мгновенно, иначе глобальная — до часа).

## Жизненный цикл трека (важно понимать перед правками GuildPlayer)

1. `enqueue(tracks)` кладёт в `this.queue`; если ничего не играет — сразу `playNext()`.
2. `playNext()` берёт `queue.shift()`, резолвит стрим через `AudioPipeline`, `audioPlayer.play(resource)`, эмитит `trackStart`.
3. Когда `AudioPlayer` переходит в `Idle` (трек доигран) или кидает `error` — вызывается `handleTrackFinished()`.
4. `handleTrackFinished()` смотрит на `skipRequested` (взведён вручную в `skip()`/`stop()`) и `loopMode`:
   - `loop: track` + НЕ ручной skip → трек возвращается в начало очереди;
   - `loop: queue` → трек уходит в конец очереди;
   - иначе — просто уходит в `history` (in-memory, max 20).
5. Снова `playNext()`. Если очередь пуста — эмит `queueEmpty` + таймер на `destroy()` через `IDLE_LEAVE_MINUTES`.

Если добавляешь новую логику завершения трека (например "не повторять если ошибка") — она идёт в `handleTrackFinished`, а не в обработчик `Idle`/`error` напрямую.

## Инварианты, которые легко случайно сломать

- **Каждый `ffmpeg`-процесс должен быть убит.** `PlaybackHandle.destroy()` вызывается в `wireAudioPlayerEvents` (Idle/error) и в `GuildPlayer.destroy()`. Если добавляешь новый путь остановки трека — не забудь вызвать `currentHandle?.destroy()`.
- **`Track.requestedBy` (юзернейм, для отображения) ≠ `Track.requestedById` (Discord ID, для записи в `history`)**. Оба выставляются в момент резолва (`resolveQuery`), не путать местами.
- **`GuildPlayer.textChannelId`** обновляется последней командой, которая трогала плеер (`/play`, `/playlist load`) — именно туда летят автопосты "сейчас играет"/ошибка трека. Если трек стартует, а `textChannelId` ещё не проставлен (гипотетически) — пост просто не отправится, тихо.
- **`QueueManager` эмитит `"created"` только один раз на гильдию** — вся общая обвязка плеера (история, автопосты) вешается в `client.ts` через эту подписку. Если создавать `GuildPlayer` напрямую (в обход `QueueManager.getOrCreate`) — обвязка не сработает.
- **`schema.sql` не копируется TS-компилятором** — см. `build`-скрипт в `package.json`.
- **Версия Node в `Dockerfile` должна совпадать с требованиями зависимостей** (`engines` в `package.json`, warnings `EBADENGINE` при `npm ci`). Реальный инцидент: `better-sqlite3@13`/`@discordjs/voice@0.19` требуют Node ≥22, а образ был на Node 20 — нативный биндинг собрался без явной ошибки, но крашил рантайм сегфолтом при старте (`docker logs` при этом пустой — крашится до первого лога). При апгрейде major-версии любого пакета с нативными бинарниками — сверяй `engines` и синхронизируй `FROM node:X` во всех стадиях `Dockerfile`.
- **`YTDLP_COOKIES_FILE` volume не должен быть `:ro`.** Реальный инцидент: смонтировали куки read-only "для безопасности" — yt-dlp успешно искал/резолвил (это видно только в stdout), но в конце пытался дозаписать обновлённые session-куки в тот же файл, падал на этом с `OSError: Read-only file system` и ненулевым кодом выхода, а наш `run()` в `ytdlp.ts` на тот момент выбрасывал ЛЮБОЙ ненулевой код выхода как полный провал — валидные данные в stdout терялись. Исправлено с двух сторон: volume теперь read-write (+ владелец файла = uid 1000, тот же что у процесса), и `run()` теперь не ревертит результат, если в stdout всё же есть данные, а код выхода ненулевой не из-за таймаута — логирует warning и использует то, что получил. Урок: ненулевой exit code внешнего процесса не всегда означает "данных нет".

## Опциональные интеграции и деградация

- Без `SPOTIFY_CLIENT_ID/SECRET` — ссылки Spotify просто не резолвятся (`resolveSpotifyUrl` кидает ошибку, поймана в `resolveQuery`/`play.ts`).
- Без `GENIUS_ACCESS_TOKEN` — `/lyrics` сразу отвечает, что не настроено (`config.geniusEnabled`).
- Без нативного `@discordjs/opus` (например, на Windows без Visual Studio Build Tools) — `@discordjs/voice` сам падает на чистый JS `opusscript` (в `optionalDependencies`/`dependencies`, см. `package.json`). В Docker (Linux) нативный модуль собирается всегда — там это не аффектит.
- Аналогично `sodium-native` (шифрование voice-пакетов) опционален, фолбэк — `@noble/ciphers` (чистый JS).

## Известные ограничения / осознанные компромиссы

- `@discordjs/opus` тянет транзитивно уязвимый `tar` через свой `node-pre-gyp` (см. `npm audit`) — апстрим-issue без фикса, риск только на этапе `npm install`/сборки образа, не в рантайме. Оставлено ради нативной скорости Opus-энкодинга (см. README).
- `/lyrics` отдаёт превью (≤500 симв.), не полный текст — сознательно, из уважения к авторским правам; и сам парсинг HTML-страницы Genius хрупкий (нет официального API для полного текста).
- Автодополнение `/play` не делает живой поиск по YouTube (только избранное+история) — иначе каждое нажатие клавиши спавнило бы процесс `yt-dlp`, что и есть тот самый источник лагов, которого просят избежать.
- Пагинация `/queue` есть (`page`-опция), но кнопок next/page нет — осознанно не усложнялось для MVP.

## Куда лезть, если просят добавить...

- **Новую команду** → новый файл в `src/commands/`, экспорт `Command`, добавить в `commandList` ([index.ts](src/commands/index.ts)), перерегистрировать (`npm run deploy-commands`).
- **Новый источник аудио** (не YouTube) → `src/music/sources/`, завести в `resolveQuery.ts` ветку по типу ссылки/запроса.
- **Новое поле в Track** → `music/types.ts`, затем всё, что мапит `Track` (репозитории БД, `resolveQuery.ts`, `embeds.ts`).
- **Новую таблицу/сущность в БД** → `db/schema.sql` (просто добавь `CREATE TABLE IF NOT EXISTS`, миграций как таковых нет — схема идемпотентна), новый файл в `db/repositories/`, прокинуть в `AppContext` (`bot/context.ts`).
- **Новую кнопку под now-playing** → `ui/buttons.ts` (добавить в `PlayerAction` и в `playerControlsRow`), обработать в `handleButton` ([client.ts](src/bot/client.ts)).

## Команды разработчика

```bash
npm run dev              # hot-reload через tsx
npm run typecheck        # tsc --noEmit для src/ + scripts/
npm run build            # компиляция в dist/ + копирование schema.sql
npm run deploy-commands  # регистрация slash-команд в Discord
docker compose up -d --build   # прод-запуск, лимит 1 CPU / 512MB (docker-compose.yml)
```

Все переменные окружения и объяснение "почему так" по архитектуре — в
[.env.example](.env.example) и [README.md](README.md) соответственно; этот
файл специально их не дублирует.
