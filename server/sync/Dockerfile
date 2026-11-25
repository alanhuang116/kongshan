# 安乐窝同步服务镜像（生产依赖 + 源码）
FROM docker.m.daocloud.io/library/node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com
COPY . .
USER node
EXPOSE 3830
CMD ["node", "index.mjs"]
