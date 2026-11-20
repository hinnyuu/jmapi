#!/usr/bin/env bash
# 清理 jmapi 冒烟残留资源：仅 jm-smoke-* 前缀的容器/卷、/tmp/jm-smoke-* 目录、
# 本地 jmapi-test:* tag 镜像。覆盖当前用户 / dev / root 各 podman 存储侧与 docker。
# 绝不触碰其他资源。用法：bash scripts/clean-test.sh
set -uo pipefail

PREFIX="jm-smoke-"
N_CTR=0
N_VOL=0
N_DIR=0
N_IMG=0

have() { command -v "$1" >/dev/null 2>&1; }
am_root() { [ "$(id -u)" -eq 0 ]; }
priv() { if am_root; then "$@"; else sudo "$@"; fi; }
sudo_ok() { am_root || { have sudo && sudo -n true 2>/dev/null; }; }

count_lines() { printf '%s\n' "$1" | grep -c . ; }

# 清理某一引擎侧：标签 引擎函数名
clean_side() {
  local label="$1" engine="$2" ids vols imgs n img
  ids="$("$engine" ps -aq --filter "name=^${PREFIX}" 2>/dev/null)"
  if [ -n "$ids" ]; then
    n="$(count_lines "$ids")"
    # shellcheck disable=SC2086
    if "$engine" rm -f $ids >/dev/null 2>&1; then
      N_CTR=$((N_CTR + n))
      echo "  [${label}] 删除容器 ${n} 个"
    fi
  fi
  vols="$("$engine" volume ls -q --filter "name=^${PREFIX}" 2>/dev/null)"
  if [ -n "$vols" ]; then
    n="$(count_lines "$vols")"
    # shellcheck disable=SC2086
    if "$engine" volume rm $vols >/dev/null 2>&1; then
      N_VOL=$((N_VOL + n))
      echo "  [${label}] 删除卷 ${n} 个"
    fi
  fi
  imgs="$("$engine" images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep '^jmapi-test:' || true)"
  if [ -n "$imgs" ]; then
    while IFS= read -r img; do
      [ -n "$img" ] || continue
      if "$engine" rmi "$img" >/dev/null 2>&1; then
        N_IMG=$((N_IMG + 1))
        echo "  [${label}] 删除镜像 ${img}"
      fi
    done <<< "$imgs"
  fi
}

podman_self() { podman "$@"; }
podman_dev() {
  ( cd /home/dev && runuser -u dev -- env XDG_RUNTIME_DIR=/run/user/1000 podman "$@" )
}
podman_root() { priv podman "$@"; }
docker_side() {
  if docker info >/dev/null 2>&1; then docker "$@"; else priv docker "$@"; fi
}

echo "== 清理 jmapi 测试残留（仅 ${PREFIX}* 与 jmapi-test:* 镜像）=="
if have podman; then
  clean_side "当前用户" podman_self
  if am_root && id dev >/dev/null 2>&1; then
    clean_side "dev" podman_dev
  fi
  if ! am_root && sudo_ok; then
    clean_side "root" podman_root
  fi
else
  echo "  未安装 podman，跳过 podman 侧"
fi
if have docker; then
  clean_side "docker" docker_side
fi

# /tmp 下仅自有前缀目录
for d in /tmp/${PREFIX}*; do
  [ -e "$d" ] || continue
  if sudo_ok; then
    priv rm -rf "$d" 2>/dev/null && N_DIR=$((N_DIR + 1)) && echo "  删除目录 ${d}"
  else
    rm -rf "$d" 2>/dev/null && N_DIR=$((N_DIR + 1)) && echo "  删除目录 ${d}"
  fi
done

echo "== 清理摘要：容器 ${N_CTR} 个 / 卷 ${N_VOL} 个 / 目录 ${N_DIR} 个 / jmapi-test:* 镜像 ${N_IMG} 个 =="
echo "未触碰任何非 jm-smoke-* / jmapi-test:* 资源"