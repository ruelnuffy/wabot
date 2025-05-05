# ---- build image ----
FROM node:18-slim

# install Chromium & libs
RUN apt-get update && \
    apt-get install -y \
         chromium libatk-1.0-0 libatk-bridge2.0-0 libnss3 \
         libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
         libxfixes3 libgbm1 libxext6 libxrender1 libasound2 \
         fonts-liberation xdg-utils && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

CMD ["npm","start"]
