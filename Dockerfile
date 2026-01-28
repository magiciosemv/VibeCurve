# 构建阶段
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 复制 package 文件
COPY package*.json ./
COPY tsconfig.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY src ./src

# 构建 TypeScript
RUN npm run build || echo "No build script found, continuing..."

# 运行阶段
FROM node:20-alpine

# 安装运行时依赖
RUN apk add --no-cache dumb-init

# 创建非 root 用户
RUN addgroup -g 1001 -S vibecurve && \
    adduser -S -u 1001 -G vibecurve vibecurve

# 设置工作目录
WORKDIR /app

# 复制构建产物和依赖
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# 复制环境变量示例
COPY .env.production.example ./.env.example

# 创建日志目录
RUN mkdir -p /app/logs && \
    chown -R vibecurve:vibecurve /app

# 切换到非 root 用户
USER vibecurve

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3002/health/live', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# 暴露端口
EXPOSE 3002

# 使用 dumb-init 启动
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
