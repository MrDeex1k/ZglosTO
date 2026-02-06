FROM oven/bun:1.3.8-alpine AS builder

WORKDIR /app

COPY package*.json ./

COPY . .

RUN if [ -f bun.lockb ]; then bun install --ci --frozen-lockfile; else bun install --ci; fi
RUN bun run build

FROM nginx:1.29.5-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
