FROM node:24-alpine AS build

WORKDIR /app

RUN apk upgrade --no-cache && \
    apk add --no-cache git

COPY package*.json ./
RUN npm ci --no-fund --no-audit

COPY . .
RUN npm run docs:build

FROM nginx:1.28.2-alpine

RUN apk upgrade --no-cache

COPY --from=build /app/.vitepress/dist /app
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://localhost:80/ || exit 1

RUN printf '#!/bin/sh\necho "Starting Moonlit documentation server..."\nexec nginx -g "daemon off;"\n' > /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
