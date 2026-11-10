FROM node:22-bookworm-slim

# Chromium for the headless render, plus fonts for emoji/accents (the frame font, Outfit, comes from Google Fonts).
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-color-emoji ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    THEMES_DIR=/data/themes \
    DATA_DIR=/data \
    SIZE_LIMIT_MB=0 \
    PORT=8080

EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
