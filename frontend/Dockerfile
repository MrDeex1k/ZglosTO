### Build stage
FROM node:24-alpine AS builder
WORKDIR /app

# Zainstaluj curl/bash i Bun
RUN apk add --no-cache curl bash libc6-compat && \
	curl -fsSL https://bun.sh/install | bash

ENV BUN_INSTALL="/root/.bun"
ENV PATH="/root/.bun/bin:${PATH}"

# Instalacja zależności (kopiujemy package.json aby wykorzystać cache)
COPY package*.json ./
RUN bun install

# Kopiujemy źródła i budujemy aplikację
COPY . .
RUN bun run build

### Production stage (nginx serwuje statyczne pliki)
FROM nginx:stable-alpine

# Kopiujemy zbudowane pliki do katalogu nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Kopia konfiguracji nginx (zapewnia obsługę SPA - fallback na index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
