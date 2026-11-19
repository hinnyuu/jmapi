# 镜像零专有字节：即梦组件由 entrypoint 启动时从官方源获取（cache-first）。
# 默认无 ffmpeg；WITH_FFMPEG=1 变体引入 GPL ffmpeg，分发者自担合规（见 NOTICE）。
ARG BASE_IMAGE=docker.io/library/node:22-slim
FROM ${BASE_IMAGE}
ARG WITH_FFMPEG=0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl python3 \
  && if [ "$WITH_FFMPEG" = "1" ]; then apt-get install -y --no-install-recommends ffmpeg; fi \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY versions.lock ./
RUN mkdir -p /config /state /output
EXPOSE 8080 8081
LABEL org.opencontainers.image.source="https://github.com/hinnyuu/jmapi" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="jmapi"
# 容器内以 root 启动后由 entrypoint 自适应降权（rootless 下映射为宿主普通用户）。
ENTRYPOINT ["node", "/app/src/entrypoint.mjs"]