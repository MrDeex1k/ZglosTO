FROM oven/bun:1.3.8-alpine

WORKDIR /app

COPY package*.json ./

COPY . .

RUN if [ -f bun.lockb ]; then bun install --ci --frozen-lockfile --production; else bun install --ci --production; fi

# Domyślny port aplikacji
EXPOSE 9955

CMD ["bun", "start"]