# 产品项目部工具优化平台 - 生产镜像（多阶段构建）
# 适用于 NAS / 云主机 / Docker 环境部署

# ---- 构建阶段 ----
FROM node:22-alpine AS builder
WORKDIR /app

# 依赖安装（利用缓存）
COPY package.json package-lock.json* ./
RUN npm config set registry https://registry.npmmirror.com \
  && npm install --no-audit --no-fund

# 复制源码
COPY . .

# 生成 Prisma Client 并构建
RUN npx prisma generate \
  && NODE_ENV=production npm run build

# ---- 运行阶段 ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# 复制 standalone 产物
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma schema 与生成的 client（standalone 产物需要）
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["sh", "-c", "npx prisma db push --accept-data-loss --skip-generate 2>/dev/null || true; node server.js"]
