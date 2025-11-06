FROM node:24-alpine

# Ustaw katalog roboczy
WORKDIR /app

# Zainstaluj curl/bash i Bun (używany jako package manager zamiast npm)
RUN apk add --no-cache curl bash libc6-compat && \
	curl -fsSL https://bun.sh/install | bash

ENV BUN_INSTALL="/root/.bun"
ENV PATH="/root/.bun/bin:${PATH}"

# Kopiuj tylko pliki zależności i zainstaluj produkcyjne zależności przez bun
COPY package*.json ./
RUN bun install

# Skopiuj resztę plików aplikacji
COPY . .

# Domyślny port aplikacji (zgodny z backend/index.js)
EXPOSE 3000

CMD ["bun", "index.js"]
