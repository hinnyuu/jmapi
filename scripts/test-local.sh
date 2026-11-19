#!/usr/bin/env bash
# jmapi 本地一键验收：单元+契约测试 → 文档门禁 →（可选）镜像冒烟。
# 用法：bash scripts/test-local.sh [镜像引用]
# 任一步失败立即 exit 1；不给镜像参数则跳过冒烟。
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

echo "== [1/3] npm test（单元 + 契约）=="
if ! npm test; then
  echo "本地验收失败：npm test 未通过" >&2
  exit 1
fi

echo "== [2/3] 文档门禁 gate.py --local =="
if ! python3 scripts/docs-gate/gate.py --local; then
  echo "本地验收失败：文档门禁未通过" >&2
  exit 1
fi

if [ "$#" -ge 1 ]; then
  echo "== [3/3] 镜像冒烟：$1 =="
  if ! bash scripts/acceptance/smoke.sh "$1"; then
    echo "本地验收失败：镜像冒烟未通过" >&2
    exit 1
  fi
else
  echo "== [3/3] 未提供镜像参数，跳过冒烟 =="
fi

echo "本地验收全部通过"