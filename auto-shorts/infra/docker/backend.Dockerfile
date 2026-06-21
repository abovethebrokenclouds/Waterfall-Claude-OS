# Auto-Shorts backend (Node/TypeScript) — production image.
# Build context must be the `auto-shorts/` directory (it needs both backend/ and
# shared/). Build:  docker build -f infra/docker/backend.Dockerfile -t auto-shorts-backend .
FROM node:20-alpine AS build
WORKDIR /app
# Install deps against the lockfile first for layer caching.
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci
# Bring in source (backend imports ../shared) and compile.
COPY backend ./backend
COPY shared ./shared
RUN cd backend && npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/package.json ./package.json
# PORT is read from the environment (hosts like Render inject it); defaults to 4000.
EXPOSE 4000
# dist layout mirrors the source tree: dist/backend/src/index.js + dist/shared/*
CMD ["node", "dist/backend/src/index.js"]
