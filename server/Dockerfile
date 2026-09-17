# syntax=docker/dockerfile:1

# --- Build stage: install all deps and compile TypeScript ---
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY server/package.json server/
RUN npm ci

COPY packages/contracts packages/contracts
COPY server server
RUN npm run build --workspace @xiaomi-car/contracts \
  && npm run build --workspace @xiaomi-car/server

# --- Production deps stage: prune dev dependencies ---
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY server/package.json server/
RUN npm ci --omit=dev

# --- Runtime stage: minimal, non-root ---
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/migrations ./server/migrations
COPY --from=build /app/server/package.json ./server/package.json
COPY package.json ./

USER node
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
