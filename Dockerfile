# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry $NPM_REGISTRY \
  && npm i -g pnpm@9.12.3
ENV SKIP_DB_PREPARE=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/prepare-db.mjs ./scripts/prepare-db.mjs
RUN pnpm install --frozen-lockfile

FROM base AS builder
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry $NPM_REGISTRY \
  && npm i -g pnpm@9.12.3
ENV SKIP_DB_PREPARE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 生成一个开箱即用的 SQLite 模板库（首次启动会复制到数据卷）
ENV DATABASE_URL="file:/app/prisma/template.db"
RUN mkdir -p /app/prisma \
  && pnpm prisma generate \
  && pnpm prisma migrate deploy \
  && pnpm prisma db seed

RUN pnpm build

FROM base AS prisma-cli
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package.json ./
RUN npm config set registry $NPM_REGISTRY \
  && mkdir -p /app/prisma-cli \
  && node -e "const fs=require('fs');const pkg=require('./package.json');const v=(pkg.devDependencies&&pkg.devDependencies.prisma)||(pkg.dependencies&&pkg.dependencies.prisma);if(!v){console.error('prisma version not found');process.exit(1)};fs.writeFileSync('/app/prisma-cli/package.json',JSON.stringify({private:true,dependencies:{prisma:v}},null,2))" \
  && npm install --prefix /app/prisma-cli --omit=dev

FROM node:22-alpine AS runner
ARG APP_VERSION
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_CACHE_DIR=/data/.next-cache
ENV APP_VERSION=$APP_VERSION

# non-root user + 初始化数据卷目录（用于写 SQLite 与生成 NEXTAUTH_SECRET）
RUN addgroup -g 1001 -S nodejs \
  && adduser -S nextjs -u 1001 -G nodejs \
  && mkdir -p /data /app/prisma /data/.next-cache \
  && echo "init" > /data/.keep \
  && chown -R nextjs:nodejs /data /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma/template.db ./prisma/template.db
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma/migrations ./prisma/migrations
COPY --from=prisma-cli --chown=nextjs:nodejs /app/prisma-cli /app/prisma-cli
COPY --chown=nextjs:nodejs docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
  && mkdir -p /app/.next/server/app \
  && chown -R nextjs:nodejs /app/.next /app/public /app/prisma /entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000

ENTRYPOINT ["/entrypoint.sh"]
