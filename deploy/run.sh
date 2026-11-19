#!/usr/bin/env bash
# 环境无关的 podman 启动脚本（podman 4.x 全兼容；Quadlet 需≥4.4 见 quadlet/）。
# 用法：JMAPI_API_KEY=<key> bash deploy/run.sh [镜像引用]
set -euo pipefail
IMAGE="${1:-ghcr.io/hinnyuu/jmapi:latest}"
DATA="${JMAPI_DATA_DIR:-$PWD/jmapi-data}"
: "${JMAPI_API_KEY:?fail-closed：请先 export JMAPI_API_KEY（openssl rand -hex 32）}"
mkdir -p "$DATA/config" "$DATA/state" "$DATA/output"
[ -f "$DATA/config/config.toml" ] || printf 'dailyCreditCap = 500\n' > "$DATA/config/config.toml"
podman run -d --name jmapi \
  -p "${JMAPI_PORT:-8080}:8080" -p "127.0.0.1:${JMAPI_ADMIN_PORT:-8081}:8081" \
  -e JMAPI_API_KEY="$JMAPI_API_KEY" \
  -e JMAPI_CLI_SOURCE="${JMAPI_CLI_SOURCE:-https://jimeng.jianying.com/novel-cli}" \
  -v "$DATA/config:/config:ro,Z" \
  -v "$DATA/state:/state:Z" \
  -v "$DATA/output:/output:Z" \
  "$IMAGE"
echo "就绪观察：curl -s http://127.0.0.1:${JMAPI_PORT:-8080}/readyz"