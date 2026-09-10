# syntax=docker/dockerfile:1

# Отдельный образ от основного бота намеренно: headless-браузер сюда не
# затаскиваем в 512MB-лимит бота, он живёт своей жизнью и запускается
# только по расписанию (см. docker-compose.yml, profile "cookie-refresh").
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev \
    # chromium-headless-shell — урезанная сборка под headless-сценарии,
    # заметно легче полного десктопного Chromium (без GUI/видео/аудио-стека).
    && npx playwright install --with-deps chromium-headless-shell

COPY refresh.mjs ./

CMD ["node", "refresh.mjs"]
