# AVM Backend Dockerfile (PostgreSQL)
# 多阶段构建: deps → build → runtime

# ============ 1. 依赖安装 ============
FROM node:20-alpine AS deps
WORKDIR /app
# 先 copy 锁文件, 利用 Docker 缓存
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev --no-audit --no-fund
# postinstall 跑 prisma generate (已含在 npm install)

# ============ 2. 编译 TS ============
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npx tsc

# ============ 3. 运行时 ============
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
# 拷贝生产依赖 + prisma CLI (用于 migrate) + 编译产物 + prisma schema
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.bin/prisma /usr/local/bin/prisma
COPY --from=builder /app/dist          ./dist
COPY --from=builder /app/prisma        ./prisma
COPY package.json ./

# 创建启动脚本: 先跑 migrate 再启动服务
RUN printf '#!/bin/sh\n\
echo "Running database migrations..."\n\
prisma migrate deploy\n\
echo "Starting server..."\n\
exec node dist/index.js\n' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1
CMD ["/app/start.sh"]
