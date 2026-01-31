# PaperGrid - 执笔为剑

一个基于 Next.js App Router 的轻量化个人博客与后台管理系统，内置认证、文章管理、评论与系统设置，支持中文/英文与深色模式。

## 主要特性

- Next.js App Router + React 19
- Prisma ORM
- NextAuth 认证
- 管理后台（文章、标签、分类、评论、用户、系统设置）
- MDX 内容支持、代码高亮、数学公式与图表
- 国际化与深色模式

## 快速开始

一键运行：复制 docker-compose.yml，直接启动。

```yaml
services:
  app:
    image: ghcr.io/xywml/papergrid:latest
    container_name: papergrid
    ports:
      - "6066:3000"
    environment:
      DATABASE_URL: "file:/data/db.sqlite"
      # 反向代理后必须改成你的公网地址
      NEXTAUTH_URL: "http://localhost:6066"
      # AUTH_TRUST_HOST: "1"
    volumes:
      - papergrid_data:/data
    restart: unless-stopped

volumes:
  papergrid_data:
```

运行：

```bash
docker compose up -d
```

### 1. 安装依赖

```bash
pnpm install
```

安装完成后会自动执行数据库准备，见下方「数据库自动初始化」。

### 2. 启动开发服务器

```bash
pnpm dev
```

### 3. 登录

默认管理员账号：
- 邮箱：`admin@example.com`
- 密码：`admin123`

如需示例文章数据，执行 `tsx prisma/seed-posts.ts`。

## 环境变量

复制 `.env.example` 到 `.env` 并按需修改：

```env
DATABASE_URL="file:./dev.db"

NEXTAUTH_URL="http://localhost:6066"
NEXTAUTH_SECRET="your-secret-key-change-this-in-production"
INIT_ADMIN_TOKEN=""
ADMIN_INIT_PASSWORD=""

GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""

RESEND_API_KEY=""

GOTIFY_URL=""
GOTIFY_TOKEN=""

NEXT_PUBLIC_APP_URL="http://localhost:6066"
NEXT_PUBLIC_DEFAULT_LOCALE="zh"
```

## 数据库自动初始化

为了让克隆后开箱即用，本项目在以下时机会自动执行数据库准备：

- `postinstall`：安装依赖后自动执行
- `predev`：启动开发服务器前自动执行

执行内容等同于：

```bash
pnpm prisma generate
pnpm prisma migrate deploy
pnpm prisma db seed
```

如果你想跳过自动准备，可设置：

```bash
SKIP_DB_PREPARE=1 pnpm install
# 或
SKIP_DB_PREPARE=1 pnpm dev
```

仅跳过种子数据：

```bash
SKIP_DB_SEED=1 pnpm dev
```

## 种子数据说明

`prisma/seed.ts` 会创建：
- 默认管理员账号（若不存在）
- 系统设置默认值（使用 upsert，幂等）

如果你修改了 `seed.ts`，克隆者执行 `db:seed` 或启动开发服务器时会应用新的默认数据。

## 常用脚本

```bash
pnpm dev         # 开发模式（含自动数据库准备）
pnpm build       # 构建
pnpm start       # 启动生产服务器
pnpm lint        # 代码检查
pnpm db:prepare  # 手动执行数据库准备
pnpm db:seed     # 仅执行种子数据
```

## Docker 一键运行

本项目提供开箱即用的 Docker Compose 配置：

```bash
docker compose up -d
```

默认会自动初始化 SQLite 数据库到数据卷，并创建默认管理员账号：
`admin@example.com / admin123`，首次登录请尽快修改。

如果你希望在本地编译镜像：

```bash
docker compose -f docker-compose.build.yml up -d --build
```

> 反向代理部署时必须将 `NEXTAUTH_URL` 改为你的公网 `https://域名`。
> 本地开发可临时设置 `AUTH_TRUST_HOST=1`。

## 目录结构

```
docker/                # 容器入口脚本
messages/              # i18n 文案
prisma/                # 数据库 schema 与迁移
public/                # 静态资源
scripts/               # 数据库准备脚本
src/
├── app/                # App Router
│   ├── actions/        # Server Actions
│   ├── admin/          # 管理后台页面
│   ├── api/            # API 路由
│   ├── auth/           # 认证页面
│   ├── categories/     # 分类页面
│   ├── posts/          # 文章页面
│   ├── tags/           # 标签页面
│   ├── about/          # 关于页
│   └── yaji/           # 项目/作品页
├── components/         # 组件
├── hooks/              # 自定义 Hooks
├── i18n/               # 国际化
├── lib/                # 工具与业务逻辑
├── proxy.ts            # 代理/适配
└── types/              # 类型定义
docker-compose.yml      # 一键运行
Dockerfile              # 镜像构建
next.config.ts
package.json
```

## 许可证

MIT
