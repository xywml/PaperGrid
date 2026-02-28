<div align="center">
  <a name="readme-top"></a>
  <img src="./public/logo.svg" alt="PaperGrid Logo" width="96" height="96" />
  <h1>PaperGrid - 执笔为剑</h1>
  <p>
    一个基于 Next.js App Router 的轻量化个人博客与后台管理系统。<br/>
    内置认证、文章管理、评论与系统设置，支持中文/英文与深色模式。
  </p>
  <p>
    <a href="https://github.com/xywml/PaperGrid/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/xywml/PaperGrid?style=for-the-badge&logo=github" /></a>
    <a href="https://github.com/xywml/PaperGrid/forks"><img alt="GitHub forks" src="https://img.shields.io/github/forks/xywml/PaperGrid?style=for-the-badge&logo=github" /></a>
    <a href="https://github.com/xywml/PaperGrid/tags"><img alt="Version (from tag)" src="https://img.shields.io/github/v/tag/xywml/PaperGrid?style=for-the-badge&logo=github&label=version&sort=semver" /></a>
    <br/>
    <a href="https://github.com/xywml/PaperGrid/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/xywml/PaperGrid?style=for-the-badge&logo=github" /></a>
    <a href="https://github.com/xywml/PaperGrid/blob/main/LICENSE"><img alt="GitHub license" src="https://img.shields.io/github/license/xywml/PaperGrid?style=for-the-badge" /></a>
    <a href="https://github.com/xywml/PaperGrid/pkgs/container/papergrid"><img alt="GHCR image" src="https://img.shields.io/badge/GHCR-ghcr.io%2Fxywml%2Fpapergrid-2f81f7?style=for-the-badge&logo=github" /></a>
  </p>

</div>

## 主要特性

- Next.js App Router + React 19
- Prisma ORM
- NextAuth 认证
- 管理后台（文章、标签、分类、评论、用户、系统设置、文件管理）
- 文件管理（本地图片上传、预览、删除、URL 回填）
- MDX 内容支持、代码高亮、数学公式与图表
- 国际化与深色模式
- 内置多套前台主题，可在 `管理后台 -> 样式` 一键切换（纸格笔记 / 终端机能 / 清透视窗 / 像素账本）

## 快速开始

### 方式一：Docker（推荐）

1. 准备目录：

```bash
mkdir -p ~/papergrid && cd ~/papergrid
```

2. 创建 `docker-compose.yml`（内容如下，与当前镜像运行配置一致）：

```yaml
services:
  app:

    image: ghcr.io/xywml/papergrid:latest
    container_name: papergrid
    ports:
      - "127.0.0.1:6066:3000"
    environment:
      # 建议持久化到数据卷，避免容器重建丢数据
      DATABASE_URL: "file:/data/db.sqlite"
      # 可选：为 AI 向量索引单独使用 SQLite 文件（推荐）
      # AI_VECTOR_DATABASE_URL: "file:/data/ai-index.sqlite"
      # 可选：AI 向量索引使用的 SQLite 日志模式，默认 DELETE（稳定优先）
      # SQLITE_JOURNAL_MODE: "DELETE"
      # 反向代理后必须改成你的公网地址（https://your-domain），否则登录会报 UntrustedHost
      NEXTAUTH_URL: "http://localhost:6066"
      # 仅本地开发可开启（生产环境不要设置）
      AUTH_TRUST_HOST: "1"
      # 可选：启用 /api/init（一次性），必须设置且仅通过请求头 x-init-token 传入
      # INIT_ADMIN_TOKEN: "请替换为随机字符串"
      # 可选：自定义 /api/init 创建的管理员初始密码（不设置则为 admin123）
      # ADMIN_INIT_PASSWORD: "请替换为强密码"
      # SMTP 邮件通知（可选）
      # SMTP_HOST: "smtp.example.com"
      # SMTP_PORT: "465"
      # SMTP_SECURE: "true"
      # SMTP_USER: "noreply@example.com"
      # SMTP_PASS: "your-smtp-password-or-app-token"
      # EMAIL_TO: "owner@example.com,ops@example.com"
      # EMAIL_REPLY_DENYLIST: "deny1@example.com,deny2@example.com"
      # EMAIL_UNSUBSCRIBE_SECRET: "change-this-secret"
      # EMAIL_REPLY_UNSUBSCRIBE_EXPIRE_DAYS: "365"
      NEXT_CACHE_DIR: "/data/.next-cache"
      MEDIA_ROOT: "/data/uploads"
    volumes:
      - papergrid_data:/data
    logging:
      driver: "local"
      options:
        max-size: "10m"
        max-file: "5"
    restart: unless-stopped

volumes:
  papergrid_data:
```

3. 首次启动：

```bash
docker compose pull && docker compose up -d
```

4. 更新到最新镜像：

```bash
cd ~/papergrid && docker compose pull && docker compose up -d
```

默认管理员账号：
- 邮箱：`admin@example.com`
- 密码：`admin123`

首次登录请立即修改密码。

### 方式二：本地开发

1. 安装依赖：

```bash
pnpm install
```

安装完成后会自动执行数据库准备，见下方「数据库自动初始化」。

2. 启动开发服务器：

```bash
pnpm dev
```

如需示例文章数据，执行 `tsx prisma/seed-posts.ts`。

## 环境变量

复制 `.env.example` 到 `.env` 并按需修改：

```env
DATABASE_URL="file:./dev.db"
# 可选：为 AI 向量索引单独使用 SQLite 文件（推荐生产启用）
# AI_VECTOR_DATABASE_URL="file:/data/ai-index.sqlite"
# 可选：AI 向量索引使用的 SQLite 日志模式；默认 DELETE（稳定优先）
# SQLITE_JOURNAL_MODE="DELETE"

NEXTAUTH_URL="http://localhost:6066"
NEXTAUTH_SECRET="your-secret-key-change-this-in-production"

# Local media storage
MEDIA_ROOT="/data/uploads"
MEDIA_MAX_UPLOAD_MB="10"
MEDIA_MAX_INPUT_PIXELS="40000000"
MEDIA_RESOLVE_CACHE_TTL_MS="30000" # 媒体元数据缓存(ms)
INIT_ADMIN_TOKEN=""
ADMIN_INIT_PASSWORD=""

GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""

SMTP_HOST=""
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER=""
SMTP_PASS=""
# 可选：多个收件人用逗号分隔；留空则自动发给所有管理员邮箱
EMAIL_TO=""
# 可选：回复通知邮件拒收名单（逗号/换行分隔）
EMAIL_REPLY_DENYLIST=""
# 可选：退订链接签名密钥（不填则回退到 NEXTAUTH_SECRET）
EMAIL_UNSUBSCRIBE_SECRET=""
# 可选：退订链接有效期（天）
EMAIL_REPLY_UNSUBSCRIBE_EXPIRE_DAYS="365"

GOTIFY_URL=""
GOTIFY_TOKEN=""

NEXT_PUBLIC_APP_URL="http://localhost:6066"
NEXT_PUBLIC_DEFAULT_LOCALE="zh"
# 可选：日志级别（fatal/error/warn/info/debug/trace/silent）
# LOG_LEVEL="info"
```

OAuth 回调填写（GitHub/Google）：
- `Homepage URL` 填你的站点地址（例如 `https://blog.miyako.space`）
- GitHub `Authorization callback URL` 固定为：`{站点地址}/api/auth/callback/github`
- Google `Authorized redirect URI` 固定为：`{站点地址}/api/auth/callback/google`
- 本地开发示例：
  - GitHub 回调：`http://localhost:6066/api/auth/callback/github`
  - Google 回调：`http://localhost:6066/api/auth/callback/google`
- `NEXTAUTH_URL` 必须与 OAuth 平台里配置的站点地址一致（协议、域名、端口都要一致）

SMTP 邮件通知说明：
- 需在后台开启 `邮件通知开启`
- 实际发件地址固定使用 `SMTP_USER`
- `email.from` 仅作为邮件显示名
- 收件人优先读取 `EMAIL_TO`，未配置时自动发送到管理员账号邮箱
- 可开启“回复评论邮件通知”，系统会给被回复人发提醒
- 回复通知支持退订链接（`/api/comments/unsubscribe`）


## 图片上传与文件管理

后台新增“文件管理”子目录，支持：
- 上传图片（仅 `jpg/jpeg/png/webp/avif`）
- 预览、复制 URL、删除文件
- 删除时自动检查引用（文章封面、作品图、用户头像、站点设置）

默认限制：
- 单文件上限：`10MB`
- 压缩策略默认：`平衡`
- 游客权限：仅可通过图片 URL 查看（无上传/删除权限）

图片访问路径：
- `GET /api/files/:id`

## 后台文章编辑器

后台文章编辑页已升级为 Markdown 所见即所得编辑器：

- 实时预览（桌面端默认编辑+预览，移动端支持编辑/预览切换）
- 支持截图粘贴、图片拖拽、工具栏上传
- 上传后自动回填图片 URL（`![](/api/files/:id)`）
- 复用文件管理上传链路（格式校验、大小限制、压缩、鉴权、限流）

默认上传规则：

- 支持格式：`jpg/jpeg/png/webp/avif`
- 单图大小上限：由 `MEDIA_MAX_UPLOAD_MB` 控制（默认 `10MB`）
- 压缩策略：`BALANCED`（平衡）

### Nginx 防盗链（valid_referers 起步）

可在反向代理中对 `/api/files/` 增加防盗链：

```nginx
location ^~ /api/files/ {
    valid_referers none blocked server_names *.your-domain.com your-domain.com;

    if ($invalid_referer) {
        return 403;
    }

    proxy_pass http://127.0.0.1:6066;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

另外建议在 Nginx 设置上传大小限制：

```nginx
client_max_body_size 10m;
```

## 插件文章 API 与接口密钥

适用于外部插件/自动化脚本管理文章，入口为：

- `GET /api/plugin/posts`
- `POST /api/plugin/posts`
- `GET /api/plugin/posts/:id`
- `PATCH /api/plugin/posts/:id`
- `DELETE /api/plugin/posts/:id`

### 1) 创建接口密钥

登录管理员后台后，进入 `管理后台 -> 接口密钥`：

- 勾选所需权限：`POST_READ` / `POST_CREATE` / `POST_UPDATE` / `POST_DELETE`
- 可选设置过期时间
- 生成后会返回明文密钥（只显示一次）

### 2) 传递方式

支持二选一：

```bash
# 方式一：x-api-key
-H "x-api-key: eak_xxxxx"

# 方式二：Authorization Bearer
-H "Authorization: Bearer eak_xxxxx"
```

### 3) 调用示例

```bash
# 列表
curl -X GET "http://localhost:6066/api/plugin/posts?page=1&limit=10" \
  -H "x-api-key: eak_your_key"

# 创建
curl -X POST "http://localhost:6066/api/plugin/posts" \
  -H "Content-Type: application/json" \
  -H "x-api-key: eak_your_key" \
  -d '{
    "title": "来自插件的文章",
    "content": "# Hello\\n插件发布成功",
    "status": "PUBLISHED",
    "locale": "zh",
    "isProtected": true,
    "password": "123456",
    "createdAt": "2026-02-09T12:00:00.000Z"
  }'

# 更新（替换 :id）
curl -X PATCH "http://localhost:6066/api/plugin/posts/:id" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eak_your_key" \
  -d '{
    "title": "插件更新后的标题",
    "status": "DRAFT",
    "isProtected": false
  }'

# 删除（替换 :id）
curl -X DELETE "http://localhost:6066/api/plugin/posts/:id" \
  -H "x-api-key: eak_your_key"
```

### 4) 返回与限制

- 未提供密钥：`401`
- 密钥无效/禁用/过期：`401`
- 权限不足：`403`
- 请求过快：`429`
- 响应头包含限流信息：`X-RateLimit-*`、`Retry-After`

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

本项目提供开箱即用的 Docker Compose 配置，首次启动与更新建议如下：

```bash
docker compose pull && docker compose up -d
```

默认会自动初始化 SQLite 数据库到数据卷，并创建默认管理员账号：
`admin@example.com / admin123`，首次登录请尽快修改。

更新时建议执行：

```bash
docker compose pull && docker compose up -d
```

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

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=xywml/PaperGrid&type=date&legend=top-left)](https://www.star-history.com/#xywml/PaperGrid&type=date&legend=top-left)
