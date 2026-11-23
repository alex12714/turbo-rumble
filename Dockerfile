# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Optional URL prefix such as /g/game. Vite bakes it into the bundle, so it is a build argument;
# the runtime stage inherits the same value for the server.
ARG BASE_PATH=""
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run check && BASE_PATH="$BASE_PATH" npm run build

FROM node:24.22.1-bookworm-slim AS runtime
ARG BASE_PATH=""
ENV NODE_ENV=production \
    BASE_PATH=$BASE_PATH \
    HOST=0.0.0.0 \
    PORT=4317 \
    DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force \
    && mkdir -p /app/data \
    && chown node:node /app/data
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server
USER node
EXPOSE 4317
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4317)+(process.env.BASE_PATH||'').replace(/\/+$/,'')+'/api/health',{signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok||!(await r.json()).ok)process.exit(1)}).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "dist-server/index.js"]
