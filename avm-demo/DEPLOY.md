# AVM 项目中心 - 部署文档

> V1.12+ | 内部项目组 / 研发团队替代飞书项目
> 数据库: PostgreSQL 16 (生产) / SQLite (本地开发)

本文档覆盖 3 种部署方式：
1. **开发模式** — 前后端分别 `npm run dev` (SQLite)
2. **Docker Compose (推荐生产)** — 一键起 PostgreSQL + backend + frontend
3. **传统部署** — pm2/systemd + PostgreSQL

---

## 1. 开发模式

适用：本地调试、二次开发（默认使用 SQLite，零配置）

```bash
# 1. 装依赖
cd backend && npm install
cd ../frontend && npm install

# 2. 初始化数据库 (首次)
cd backend
npx prisma db push        # 建表
npx tsx src/seed.ts       # 导入种子数据 (7 个测试账号 + 6 客户 + 10 车型 + 7 项目 + 28 工作项 + 24 依赖)

# 3. 启后端 (端口 4000)
npm run dev

# 4. 启前端 (端口 9000) — 新窗口
cd ../frontend
npm run dev

# 5. 浏览器开 http://localhost:9000
#    登录: admin / admin123  (tenant_admin)
#           pm    / pm123     (space_admin)
#           lisi  / 123456    (member)
```

### 切换为本地 PostgreSQL 开发

```bash
# 1. 修改 backend/.env
DATABASE_URL="postgresql://avm:avm@localhost:5432/avm?schema=public"

# 2. 重建
cd backend
npx prisma migrate dev --name init   # 建表 + 生成 client
npx tsx src/seed.ts                   # 种子数据
npm run dev
```

---

## 2. Docker Compose (推荐生产)

适用：内网部署 / 演示环境 / 准生产。包含 PostgreSQL 16 自动管理。

### 2.1 首次启动

```bash
# 1. (可选) 修改数据库密码
cp .env.example .env
# 编辑 .env, 修改 POSTGRES_PASSWORD

# 2. 一键启动 (构建 + 数据库迁移 + 启动)
docker compose up -d --build

# 查看日志
docker compose logs -f
docker compose logs -f backend    # 只看后端
docker compose logs -f postgres   # 只看数据库

# 查看状态
docker compose ps
```

启动后自动执行：
1. PostgreSQL 启动 → 健康检查通过
2. Backend 启动 → `prisma migrate deploy` 自动建表
3. Frontend 启动 → nginx 反代到 backend

### 2.2 首次数据初始化

```bash
# Docker Compose 启动后，在 backend 容器内初始化种子数据
docker compose exec backend npx tsx src/seed.ts

# 验证
curl http://localhost:4000/api/health
```

### 2.3 访问

- **前端**：http://localhost:8080
- **后端 API** (调试用)：http://localhost:4000
- 浏览器访问 8080，前端会把 `/api/*` 反代到 backend 容器

### 2.4 数据持久化

PostgreSQL 数据挂载在 named volume `postgres-data`：
- 容器内路径：`/var/lib/postgresql/data`
- 数据保留：升级 / 重启容器不丢
- 备份：
```bash
docker compose exec postgres pg_dump -U avm avm > avm-backup-$(date +%Y%m%d).sql
```

### 2.5 升级

```bash
git pull
docker compose down
docker compose up -d --build
# 数据 volume 保留；prisma migrate deploy 自动运行
```

### 2.6 修改配置

环境变量在 `docker-compose.yml` 中：

```yaml
environment:
  NODE_ENV: production
  PORT: 4000
  DATABASE_URL: "postgresql://avm:password@postgres:5432/avm?schema=public"
```

**生产模式 (NODE_ENV=production)**：
- 所有 API 必须带 `Authorization: Bearer <token>` 头
- token 通过 `POST /api/users/login` 拿 (持久化到 db)
- role 层级: `member` < `space_admin` < `tenant_admin`
- 没有 admin role 时无法 DELETE

### 2.7 改前端 API 地址

如果 backend 不在 docker 网络里（比如分离部署），改 `docker-compose.yml`：

```yaml
services:
  frontend:
    build:
      args:
        VITE_API_BASE: https://api.your-company.com/api
```

`VITE_API_BASE` 会在 build 时注入到前端 bundle。**改完必须重新 build**：

```bash
docker compose build frontend
docker compose up -d
```

### 2.8 关闭

```bash
docker compose down              # 停服务 (保留 volume)
docker compose down -v           # 停服务 + 删 volume (数据会丢)
```

---

## 3. 传统部署 (pm2 + PostgreSQL)

适用：已有内网 K8s / VM 不想上 Docker

### 3.1 安装 PostgreSQL

```bash
# Ubuntu/Debian
apt install postgresql-16
# 创建数据库
sudo -u postgres createuser avm -P
sudo -u postgres createdb avm -O avm
```

### 3.2 后端

```bash
cd backend
npm install
npm run build                    # tsc → dist/

# 配置环境变量
export DATABASE_URL="postgresql://avm:password@localhost:5432/avm?schema=public"
export NODE_ENV=production

# 建表 + 种子数据
npx prisma migrate deploy        # 应用迁移
npx tsx src/seed.ts              # 种子数据 (首次)
npx prisma generate              # 生成 client (每次 schema 改完跑)

# 用 pm2 跑
pm2 start dist/index.js --name avm-backend -i 1
pm2 save
pm2 startup
```

### 3.3 前端

```bash
cd frontend
npm install
npm run build                    # 输出到 dist/

# nginx 配置 (参考 frontend/nginx.conf)
# root 指向 /path/to/frontend/dist
# /api/* 反代到 http://127.0.0.1:4000
```

### 3.4 systemd (备选)

```ini
# /etc/systemd/system/avm-backend.service
[Unit]
Description=AVM Backend
After=network.target postgresql.service

[Service]
Type=simple
User=avm
WorkingDirectory=/opt/avm/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=DATABASE_URL=postgresql://avm:password@localhost:5432/avm?schema=public

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now avm-backend
systemctl status avm-backend
```

---

## 4. 端口规划

| 服务 | 容器内 | 宿主机 (compose) | 内网部署 |
|------|--------|------------------|----------|
| PostgreSQL | 5432 | - (内部) | 内网 5432 |
| 前端 (nginx) | 80 | 8080 | 80/443 |
| 后端 (Express) | 4000 | 4000 (可选) | 内网 4000 |

---

## 5. 数据库迁移管理

### 开发阶段 (schema 频繁变更)

```bash
cd backend
npx prisma db push              # 直接同步 schema 到 DB (不生成迁移文件)
npx tsx src/seed.ts             # 重新导入种子数据
```

### 生产阶段 (版本化迁移)

```bash
# 创建新的迁移 (schema.prisma 改完后)
npx prisma migrate dev --name add_new_field

# 生产环境应用迁移
npx prisma migrate deploy

# 查看迁移状态
npx prisma migrate status
```

### 迁移回滚

```bash
# PostgreSQL 支持事务回滚
npx prisma migrate resolve --rolled-back "migration_name"
```

---

## 6. LLM 配置

进系统后 → **AI 设置** 页面，填入：
- OpenAI / Anthropic / DeepSeek / 通义千问 / 智谱 GLM / Ollama / 自定义 OpenAI 兼容
- API Key + baseUrl + model
- 点 "测试连接" 验证
- 选 "主 provider" 设为默认

`MiniMax` / `qwen` / `glm` / `kimi` / `豆包` 都内置支持，复制粘贴 baseUrl + key 即可。

---

## 7. MCP 集成 (LLM/IDE)

MCP Server 端点在 backend 容器内：
- **HTTP JSON-RPC**: `http://localhost:4000/api/mcp/info` (查工具列表)
- **Streamable HTTP** (Claude/Trae/Cursor): `http://backend:4000/api/mcp/stream`
- **stdio** (本地 LLM): 见 `MCP_SETUP.md` 配 `npx tsx backend/src/bin/mcp-stdio.ts`

详见 `MCP_SETUP.md`。

---

## 8. 升级 checklist

```bash
# 1. 备份数据库
docker compose exec postgres pg_dump -U avm avm > avm-backup-$(date +%Y%m%d).sql

# 2. 拉代码
git pull

# 3. 重建 + 重启
docker compose up -d --build

# 4. 验证
docker compose ps
curl http://localhost:4000/api/health
# 浏览器测核心功能
```

---

## 9. 常见问题

### 9.1 启动后访问 502
Backend 健康检查没过。`docker compose logs backend` 看错误。
常见原因：PostgreSQL 还未就绪 / 数据库连接串错误 / 端口被占。

### 9.2 PostgreSQL 连接失败
```bash
# 检查 postgres 日志
docker compose logs postgres

# 检查连接串
docker compose exec backend env | grep DATABASE_URL
```

### 9.3 Prisma client EPERM
Windows 跑 `prisma generate` 时如果 backend 进程在，会报 EPERM。
解决：先停 backend，再 generate。

### 9.4 LLM 调用 400 "LLM 未配置"
进 AI 设置 配 key + 选主 provider。

### 9.5 MCP SSE 连不上
检查 nginx 是否启用了 `proxy_buffering off` 和较长 `proxy_read_timeout`。
MCP 长连接需要 30+ 分钟不超时。

---

## 10. 监控 / 日志

```bash
# 容器日志
docker compose logs --tail 100 backend
docker compose logs -f --since 1h

# PostgreSQL 慢查询日志 (需要开启)
docker compose exec postgres psql -U avm -c "LOAD 'auto_explain'; SET auto_explain.log_min_duration = '1s';"

# 应用日志 (本地)
backend/backend.log
backend/backend.log.err

# 性能监控
# backend 已内置 LRU 缓存 + Prisma 索引
# 看 E2E: final_e2e_perf.py 基线 (35 API/329ms avg 9ms)
```
