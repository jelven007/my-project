# syntax=docker/dockerfile:1

# --- Build the static portal bundle ---
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build --workspace @xiaomi-car/contracts \
  && npm run build --workspace @xiaomi-car/web

# --- Serve with nginx as a non-root distroless-style runtime ---
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
