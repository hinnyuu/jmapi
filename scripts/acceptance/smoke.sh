#!/usr/bin/env bash
# jmapi 镜像冒烟验收（M0）
# 用法：bash scripts/acceptance/smoke.sh <镜像引用>
# 环境变量：
#   JMAPI_SMOKE_MATRIX=full   跑 CI 全量矩阵（默认 local 本地子集）
#   JMAPI_SMOKE_CLI_SOURCE    覆盖官方安装器 URL（亦认 JMAPI_CLI_SOURCE）
# 资源隔离：所有容器/卷/临时目录均带 ${TAG} 前缀，trap 只清自有资源；
# 结束时 rmi 被测镜像（CI 环境一次性；本地重拉成本低）。
set -uo pipefail

IMAGE="${1:-}"
if [ -z "$IMAGE" ]; then
  echo "用法：bash scripts/acceptance/smoke.sh <镜像引用>" >&2
  exit 1
fi

MATRIX="${JMAPI_SMOKE_MATRIX:-local}"
API_KEY="jmapi-smoke-test-key"   # CI 测试凭据，gitleaks 白名单覆盖
CLI_SOURCE="${JMAPI_SMOKE_CLI_SOURCE:-${JMAPI_CLI_SOURCE:-https://jimeng.jianying.com/novel-cli}}"
TAG="jm-smoke-$$-${RANDOM}"
BIND_ROOT="/tmp/${TAG}-root"
PASS=0
FAIL=0
ROOT_EUID="$(id -u)"
CREATED_USER=""
ALT_UID=""
DOCKER_USED=0
DOCKER_NEED_SUDO=0

is_ci() { [ "${CI:-}" = "true" ] || [ "${GITHUB_ACTIONS:-}" = "true" ]; }
have() { command -v "$1" >/dev/null 2>&1; }
# 提权执行：root 直接跑，否则 sudo
priv() { if [ "$ROOT_EUID" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

# rootless podman 封装：root 且存在 dev 用户时切到 dev 执行。
# 注意 runuser 保留调用者 cwd，必须先 cd 到 dev 的 HOME，否则 podman 相对路径/权限踩坑。
as_podman() {
  if [ "$ROOT_EUID" -eq 0 ] && id dev >/dev/null 2>&1; then
    ( cd /home/dev && runuser -u dev -- env XDG_RUNTIME_DIR=/run/user/1000 podman "$@" )
  else
    podman "$@"
  fi
}
# rootful podman（full 矩阵 T5）
root_podman() { priv podman "$@"; }
# docker 引擎（full 矩阵 T7）
docker_engine() {
  if [ "$DOCKER_NEED_SUDO" -eq 1 ]; then priv docker "$@"; else docker "$@"; fi
}

ok()  { printf '  PASS: %s\n' "$1"; PASS=$((PASS + 1)); }
bad() { printf '  FAIL: %s\n' "$1"; FAIL=$((FAIL + 1)); }
assert_eq() { # 消息 期望 实得
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1（期望 [$2]，实得 [$3]）"; fi
}
assert_contains() { # 消息 文本 标记
  if printf '%s' "$2" | grep -qF -- "$3"; then ok "$1"; else bad "$1（未含标记 [$3]）"; fi
}
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 6 "$@"; }

# 轮询任意端点直至拿到 200（容器启动有秒级竞态，单次 curl 会假红）；返回最后状态码
wait_http() {
  local url="$1" limit="$2" deadline=$((SECONDS + $2)) code=000
  while [ "$SECONDS" -lt "$deadline" ]; do
    code="$(http_code "$url")"
    [ "$code" = "200" ] && break
    sleep 1
  done
  printf '%s' "$code"
}

# 轮询 readyz：base_url 超时秒数；200 即返回 0
wait_ready() {
  local base="$1" limit="$2" deadline=$((SECONDS + $2))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ "$(http_code "${base}/readyz")" = "200" ]; then return 0; fi
    sleep 2
  done
  return 1
}
check_ready() { # 标签 base_url 超时秒数
  if wait_ready "$2" "$3"; then
    ok "$1 readyz 就绪（≤${3}s）"
  else
    bad "$1 readyz 超时未就绪（${3}s）"
  fi
}

# 在 18000..19999 段随机挑空闲端口（bash /dev/tcp 探测：能连通即被占用）
pick_port() {
  local attempt port
  for attempt in $(seq 1 60); do
    port=$((18000 + RANDOM % 2000))
    if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
      continue
    fi
    printf '%s\n' "$port"
    return 0
  done
  echo "错误：18000-19999 段未找到空闲端口" >&2
  return 1
}

# 准备 bind 三目录；config 写 dailyCreditCap=500 并 chmod 555（ro 语义由挂载 :ro 保证）
prepare_bind() { # 目录 属主uid
  local dir="$1" owner="$2"
  mkdir -p "${dir}/config" "${dir}/state" "${dir}/output"
  printf '# jmapi 冒烟测试配置\ndailyCreditCap = 500\n' > "${dir}/config/config.toml"
  chmod 555 "${dir}/config"
  if [ "$ROOT_EUID" -eq 0 ]; then
    chown -R "${owner}:${owner}" "$dir"
  elif [ "$owner" != "$(id -u)" ]; then
    sudo chown -R "${owner}:${owner}" "$dir"
  fi
}

# meta.json 宿主路径（兼容 /state/meta.json 与 /state/cli/meta.json 两种落盘位置）
meta_path() {
  if [ -f "$1/cli/meta.json" ]; then printf '%s\n' "$1/cli/meta.json"
  else printf '%s\n' "$1/meta.json"; fi
}

# 统一启动：引擎函数 容器名 主机端口 state源(bind路径或命名卷) config目录 output目录
start_container() {
  local engine="$1" name="$2" port="$3" state="$4" cfg="$5" out="$6"
  "$engine" run -d --name "$name" \
    -p "${port}:8080" \
    -e "JMAPI_API_KEY=${API_KEY}" \
    -e "JMAPI_CLI_SOURCE=${CLI_SOURCE}" \
    -v "${cfg}:/config:ro" \
    -v "${state}:/state" \
    -v "${out}:/output" \
    "$IMAGE" >/dev/null
}

cleanup() {
  echo "== 清理自有资源（仅前缀 ${TAG}）=="
  local ids vols
  # 失败时先 dump 自有容器日志再清理（诊断纪律：红必留现场摘要）
  if [ "$FAIL" -gt 0 ]; then
    for c in $(as_podman ps -aq --filter "name=^${TAG}" 2>/dev/null); do
      echo "-- logs $c --"; as_podman logs --tail 25 "$c" 2>&1 | tail -25
    done
    if [ -n "$CREATED_USER" ]; then
      for c in $(alt_podman ps -aq --filter "name=^${TAG}" 2>/dev/null); do
        echo "-- logs(alt) $c --"; alt_podman logs --tail 25 "$c" 2>&1 | tail -25
      done
    fi
  fi
  # rootless 侧（dev 或当前用户）
  ids="$(as_podman ps -aq --filter "name=^${TAG}" 2>/dev/null)"
  # shellcheck disable=SC2086
  [ -n "$ids" ] && as_podman rm -f $ids >/dev/null 2>&1
  vols="$(as_podman volume ls -q --filter "name=^${TAG}" 2>/dev/null)"
  # shellcheck disable=SC2086
  [ -n "$vols" ] && as_podman volume rm $vols >/dev/null 2>&1
  as_podman rmi "$IMAGE" >/dev/null 2>&1
  # rootful 侧（仅 root 或免密 sudo 可用时）
  if [ "$ROOT_EUID" -eq 0 ] || sudo -n true 2>/dev/null; then
    ids="$(root_podman ps -aq --filter "name=^${TAG}" 2>/dev/null)"
    # shellcheck disable=SC2086
    [ -n "$ids" ] && root_podman rm -f $ids >/dev/null 2>&1
    vols="$(root_podman volume ls -q --filter "name=^${TAG}" 2>/dev/null)"
    # shellcheck disable=SC2086
    [ -n "$vols" ] && root_podman volume rm $vols >/dev/null 2>&1
    root_podman rmi "$IMAGE" >/dev/null 2>&1
  fi
  # docker 侧（仅当本次用过 docker）
  if [ "$DOCKER_USED" -eq 1 ]; then
    ids="$(docker_engine ps -aq --filter "name=^${TAG}" 2>/dev/null)"
    # shellcheck disable=SC2086
    [ -n "$ids" ] && docker_engine rm -f $ids >/dev/null 2>&1
    docker_engine rmi "$IMAGE" >/dev/null 2>&1
  fi
  # 临时用户（仅 full+CI 现场创建过才清）
  if [ -n "$CREATED_USER" ]; then
    ids="$(alt_podman ps -aq --filter "name=^${TAG}" 2>/dev/null)"
    # shellcheck disable=SC2086
    [ -n "$ids" ] && alt_podman rm -f $ids >/dev/null 2>&1
    vols="$(alt_podman volume ls -q --filter "name=^${TAG}" 2>/dev/null)"
    # shellcheck disable=SC2086
    [ -n "$vols" ] && alt_podman volume rm $vols >/dev/null 2>&1
    alt_podman rmi "$IMAGE" >/dev/null 2>&1
    priv loginctl disable-linger "$CREATED_USER" >/dev/null 2>&1 || true
    priv pkill -u "$CREATED_USER" >/dev/null 2>&1 || true
    sleep 1
    [ -n "$ALT_UID" ] && priv rm -rf "/run/user/${ALT_UID}" 2>/dev/null
    priv userdel -r "$CREATED_USER" >/dev/null 2>&1 || true
  fi
  # 仅删自有前缀目录
  case "$BIND_ROOT" in
    /tmp/jm-smoke-*-root)
      if [ "$ROOT_EUID" -eq 0 ] || sudo -n true 2>/dev/null; then
        priv rm -rf "$BIND_ROOT" 2>/dev/null
      else
        rm -rf "$BIND_ROOT" 2>/dev/null
      fi
      ;;
  esac
}
trap cleanup EXIT

echo "== jmapi 冒烟：镜像=${IMAGE} 矩阵=${MATRIX} 前缀=${TAG} =="
if ! have podman; then
  echo "错误：未找到 podman" >&2
  exit 1
fi
# root+dev 场景确保 dev 的 XDG_RUNTIME_DIR 存在（rootless 网络栈需要）
if [ "$ROOT_EUID" -eq 0 ] && id dev >/dev/null 2>&1 && [ ! -d /run/user/1000 ]; then
  mkdir -p /run/user/1000 && chown 1000:1000 /run/user/1000 && chmod 700 /run/user/1000
fi
echo "== 拉取镜像（rootless 侧）=="
if ! as_podman pull "$IMAGE" >/dev/null; then
  echo "错误：镜像拉取失败：${IMAGE}" >&2
  exit 1
fi

# ---------- T1 rootless + bind ----------
echo "== T1 rootless + bind（healthz/readyz/鉴权/ro/属主/降权/fetch）=="
B1="${BIND_ROOT}/t1"
if [ "$ROOT_EUID" -eq 0 ] && id dev >/dev/null 2>&1; then
  prepare_bind "$B1" 1000
else
  prepare_bind "$B1" "$(id -u)"
fi
PORT1="$(pick_port)" || exit 1
BASE1="http://127.0.0.1:${PORT1}"
start_container as_podman "${TAG}-t1" "$PORT1" "${B1}/state" "${B1}/config" "${B1}/output"
assert_eq "T1 healthz 恒 200" "200" "$(wait_http "${BASE1}/healthz" 15)"
check_ready "T1" "$BASE1" 180
assert_eq "T1 /v1/models 无 key 401" "401" "$(http_code "${BASE1}/v1/models")"
assert_contains "T1 401 OpenAI 错误信封" "$(curl -s --max-time 6 "${BASE1}/v1/models")" '"error"'
assert_eq "T1 有 key 且就绪 M0 未实现 501" "501" "$(http_code -H "Authorization: Bearer ${API_KEY}" "${BASE1}/v1/models")"
if as_podman exec "${TAG}-t1" touch /config/probe >/dev/null 2>&1; then
  bad "T1 /config 只读（touch 应被拒绝）"
else
  ok "T1 /config 只读（touch 被拒绝）"
fi
META1="$(meta_path "${B1}/state")"
assert_eq "T1 meta.json 宿主属主==bind 目录属主" "$(stat -c %u "${B1}/state")" "$(stat -c %u "$META1" 2>/dev/null)"
assert_eq "T1 容器内进程 uid（rootless+属主即 userns owner→0）" "0" "$(as_podman exec "${TAG}-t1" awk '/^Uid:/{print $2}' /proc/1/status 2>/dev/null)"
assert_contains "T1 首启日志 fetch 标记" "$(as_podman logs "${TAG}-t1" 2>&1)" "fetch"

# ---------- T2 删容器重建（缓存命中） ----------
echo "== T2 删容器重建（同 bind，缓存命中零网络）=="
MT_BEFORE="$(stat -c %Y "$META1" 2>/dev/null)"
as_podman rm -f "${TAG}-t1" >/dev/null 2>&1
start_container as_podman "${TAG}-t2" "$PORT1" "${B1}/state" "${B1}/config" "${B1}/output"
check_ready "T2" "$BASE1" 20
assert_contains "T2 日志 cache hit 标记" "$(as_podman logs "${TAG}-t2" 2>&1)" "cache hit"
assert_eq "T2 meta.json mtime 不变" "$MT_BEFORE" "$(stat -c %Y "$META1" 2>/dev/null)"

# ---------- T3 优雅退出 ----------
echo "== T3 SIGTERM 优雅退出 =="
as_podman stop -t 5 "${TAG}-t2" >/dev/null 2>&1
assert_eq "T3 stop -t 5 后 ExitCode==0" "0" "$(as_podman inspect --format '{{.State.ExitCode}}' "${TAG}-t2" 2>/dev/null)"

# ---------- T4 rootless + named volume ----------
echo "== T4 rootless + named volume（state 用命名卷）=="
PORT4="$(pick_port)" || exit 1
start_container as_podman "${TAG}-t4" "$PORT4" "${TAG}-state-vol" "${B1}/config" "${B1}/output"
check_ready "T4" "http://127.0.0.1:${PORT4}" 180

# ---------- full 矩阵追加项 ----------
if [ "$MATRIX" = "full" ]; then
  # T5 rootful + bind：bind 属主 root → 容器内 chown 1000 后降权
  echo "== T5 rootful + bind（属主 root → uid 1000）=="
  if [ "$ROOT_EUID" -eq 0 ] || have sudo; then
    B5="${BIND_ROOT}/t5"
    prepare_bind "$B5" 0
    PORT5="$(pick_port)" || exit 1
    root_podman pull "$IMAGE" >/dev/null 2>&1
    start_container root_podman "${TAG}-t5" "$PORT5" "${B5}/state" "${B5}/config" "${B5}/output"
    check_ready "T5" "http://127.0.0.1:${PORT5}" 180
    assert_eq "T5 容器内进程 uid（rootful→1000）" "1000" "$(root_podman exec "${TAG}-t5" awk '/^Uid:/{print $2}' /proc/1/status 2>/dev/null)"
    assert_eq "T5 宿主 meta.json 属主==1000" "1000" "$(stat -c %u "$(meta_path "${B5}/state")" 2>/dev/null)"
  else
    echo "  SKIP: T5 rootful+bind（无 root/sudo）"
  fi

  # T6 非 1000 uid rootless + bind：仅 full 且仅 CI 允许现场建临时用户
  echo "== T6 非 1000 uid rootless + bind =="
  if ! is_ci; then
    echo "  SKIP: T6 非 1000 uid（仅 CI 允许建临时用户，本地 full 亦禁止）"
  else
    ALT_UID=1002
    while id "$ALT_UID" >/dev/null 2>&1; do ALT_UID=$((ALT_UID + 1)); done
    CREATED_USER="${TAG}-u"
    ALT_HOME="/home/${CREATED_USER}"
    priv useradd -m -u "$ALT_UID" "$CREATED_USER"
    # subuid/subgid 兜底（useradd 通常已自动分配）
    ensure_subid() { # 文件 用户名
      local file="$1" user="$2" start=100000 _n s c
      grep -q "^${user}:" "$file" 2>/dev/null && return 0
      while IFS=: read -r _n s c; do
        case "$s$c" in ''|*[!0-9]*) continue ;; esac
        [ "$((s + c))" -gt "$start" ] && start=$((s + c))
      done < "$file"
      start=$(( ((start + 65535) / 65536) * 65536 ))
      printf '%s:%s:65536\n' "$user" "$start" | priv tee -a "$file" >/dev/null
    }
    ensure_subid /etc/subuid "$CREATED_USER"
    ensure_subid /etc/subgid "$CREATED_USER"
    priv loginctl enable-linger "$CREATED_USER" >/dev/null 2>&1 || true
    priv mkdir -p "/run/user/${ALT_UID}"
    priv chown "${ALT_UID}:${ALT_UID}" "/run/user/${ALT_UID}"
    priv chmod 700 "/run/user/${ALT_UID}"
    alt_podman() {
      ( cd "$ALT_HOME" && priv runuser -u "$CREATED_USER" -- \
          env HOME="$ALT_HOME" XDG_RUNTIME_DIR="/run/user/${ALT_UID}" podman "$@" )
    }
    B6="${BIND_ROOT}/t6"
    prepare_bind "$B6" "$ALT_UID"
    if ! alt_podman pull "$IMAGE"; then echo "  FAIL: T6 临时用户侧 pull 失败"; fi
    PORT6="$(pick_port)" || exit 1
    start_container alt_podman "${TAG}-t6" "$PORT6" "${B6}/state" "${B6}/config" "${B6}/output"
    if ! check_ready "T6" "http://127.0.0.1:${PORT6}" 180; then
      echo "-- T6 诊断：alt 侧容器与日志 --"
      alt_podman ps -a --filter "name=${TAG}" 2>&1 | tail -5
      alt_podman logs --tail 30 "${TAG}-t6" 2>&1 | tail -30
    fi
    assert_eq "T6 meta.json 宿主属主==临时用户 uid" "$ALT_UID" "$(stat -c %u "$(meta_path "${B6}/state")" 2>/dev/null)"
    assert_eq "T6 容器内进程 uid（rootless→0）" "0" "$(alt_podman exec "${TAG}-t6" awk '/^Uid:/{print $2}' /proc/1/status 2>/dev/null)"
  fi

  # T7 docker + bind
  echo "== T7 docker + bind =="
  if have docker; then
    DOCKER_USED=1
    if ! docker info >/dev/null 2>&1; then DOCKER_NEED_SUDO=1; fi
    B7="${BIND_ROOT}/t7"
    prepare_bind "$B7" 0
    PORT7="$(pick_port)" || exit 1
    docker_engine pull "$IMAGE" >/dev/null 2>&1
    start_container docker_engine "${TAG}-t7" "$PORT7" "${B7}/state" "${B7}/config" "${B7}/output"
    check_ready "T7" "http://127.0.0.1:${PORT7}" 180
    assert_eq "T7 healthz 恒 200" "200" "$(http_code "http://127.0.0.1:${PORT7}/healthz")"
  else
    echo "  SKIP: T7 docker+bind（未安装 docker）"
  fi
fi

echo
echo "== 冒烟结果：PASS=${PASS} FAIL=${FAIL} =="
[ "$FAIL" -eq 0 ] || exit 1