# 安乐窝「同游」中转镜像（生产依赖 + 源码）
# 构建上下文是仓库根目录（发布脚本统一用根目录），源码在 server/。
# 进程只听 0.0.0.0:3820（集群里由 Ingress 把 /ws 转进来），不存任何东西、没有密钥。
FROM docker.m.daocloud.io/library/node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com
COPY server/relay.mjs server/core.mjs server/proto.json ./
USER node
EXPOSE 3820
CMD ["node", "relay.mjs"]
