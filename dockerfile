FROM node:18-slim

# Install Chrome + libs
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 libxss1 libasound2 libatk1.0-0 libgtk-3-0 libgbm-dev \
    libxcomposite1 libxcursor1 libxdamage1 libxfixes3 libxi6 libxtst6 \
    libxrandr2 libpango-1.0-0 libpangocairo-1.0-0 libxcb1 \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip its download and use the system Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

CMD ["npm", "start"]
