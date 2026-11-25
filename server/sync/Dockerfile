# 安乐窝同步服务镜像（生产依赖 + 源码）
# 构建上下文是仓库根目录（发布脚本统一用根目录），源码在 server/sync/。
FROM docker.m.daocloud.io/library/node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/sync/package.json server/sync/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com
COPY server/sync/ ./
USER node
EXPOSE 3830
CMD ["node", "index.mjs"]
