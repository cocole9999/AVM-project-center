# AVM Frontend Dockerfile
# 多阶段: build → nginx 静态服务

# ============ 1. 构建 ============
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
# 允许传 API 地址 (运行时注入)
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# ============ 2. Nginx 静态服务 ============
FROM nginx:1.27-alpine AS runtime
# 复制 build 产物
COPY --from=builder /app/dist /usr/share/nginx/html
# 复制 nginx 配置 (含 /api 反代到 backend)
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
