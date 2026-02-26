# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
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

# 固化 sqlite-vec 原生扩展，避免 standalone 裁剪可选依赖后运行时找不到 vec0.so
RUN set -eu; \
  ext_path="$(find /app/node_modules/.pnpm -maxdepth 5 -type f -path '*/node_modules/sqlite-vec-*/vec0.so' | head -n 1)"; \
  if [ -z "$ext_path" ]; then \
    echo "sqlite-vec 扩展文件 vec0.so 未找到，构建失败" >&2; \
    exit 1; \
  fi; \
  mkdir -p /app/sqlite-vec-extension; \
  cp "$ext_path" /app/sqlite-vec-extension/vec0.so

FROM base AS prisma-cli
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package.json ./
RUN npm config set registry $NPM_REGISTRY \
  && mkdir -p /app/prisma-cli \
  && node -e "const fs=require('fs');const pkg=require('./package.json');const v=(pkg.devDependencies&&pkg.devDependencies.prisma)||(pkg.dependencies&&pkg.dependencies.prisma);if(!v){console.error('prisma version not found');process.exit(1)};fs.writeFileSync('/app/prisma-cli/package.json',JSON.stringify({private:true,dependencies:{prisma:v}},null,2))" \
  && npm install --prefix /app/prisma-cli --omit=dev

FROM node:22-bookworm-slim AS runner
ARG APP_VERSION
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_CACHE_DIR=/data/.next-cache
ENV APP_VERSION=$APP_VERSION
ENV SQLITE_VEC_EXTENSION_PATH=/app/sqlite-vec-extension/vec0

# non-root user + 初始化数据卷目录（用于写 SQLite 与生成 NEXTAUTH_SECRET）
RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid 1001 --create-home --shell /usr/sbin/nologin nextjs \
  && mkdir -p /data /data/uploads /app/prisma /data/.next-cache \
  && echo "init" > /data/.keep \
  && chown -R nextjs:nodejs /data /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/sqlite-vec-extension ./sqlite-vec-extension
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
