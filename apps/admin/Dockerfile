# syntax=docker/dockerfile:1

# --- Build the static admin bundle ---
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/admin/package.json apps/admin/
RUN npm ci

COPY packages/contracts packages/contracts
COPY apps/admin apps/admin
RUN npm run build --workspace @xiaomi-car/contracts \
  && npm run build --workspace @xiaomi-car/admin

# --- Serve with nginx ---
FROM nginx:1.27-alpine AS runtime
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
