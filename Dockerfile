# ---- build: compile the frontend and bundle the server
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run validate-content -- --allow-drafts && npm test && npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# ---- runtime: just Node, production deps, the build and the content
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/percentle.db \
    CONTENT_PATH=/app/content/rounds.json \
    STATIC_DIR=/app/dist/public \
    NODE_OPTIONS=--max-old-space-size=96
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY content ./content
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "dist/server.mjs"]
