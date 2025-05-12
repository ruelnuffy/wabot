# use the latest Node 22 slim image
FROM node:22-bullseye-slim

# install Chromium and its dependencies
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates \
     fonts-liberation \
     libasound2 \
     libatk-bridge2.0-0 \
     libatk1.0-0 \
     libcups2 \
     libgbm1 \
     libgtk-3-0 \
     libnss3 \
     libx11-xcb1 \
     libxcomposite1 \
     libxdamage1 \
     libxrandr2 \
     libxss1 \
     libxtst6 \
     xdg-utils \
     chromium \
  && rm -rf /var/lib/apt/lists/*

# tell Puppeteer to use the system-installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    # optional: reduce risk of running as root inside container
    PUPPETEER_RUN_AS_ROOT=true

WORKDIR /usr/src/app

# copy package.json and install deps
COPY package*.json ./
RUN npm ci --omit=dev

# copy the rest of your bot’s code
COPY . .

# default command
CMD ["node", "index.js"]
