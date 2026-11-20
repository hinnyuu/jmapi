# 人工残留验收 runbook（宿主依赖项）v3

> 覆盖 CI/本机无法验收的宿主项：SELinux enforcing、Quadlet≥4.4、公网 Caddy WAN 侧。
> 格式与证据纪律见 [conventions](../../docs/project/conventions.md#人工残留-runbook-纪律)：
> 四段全代码块；**证据通道 = 服务自身日志（podman logs）终态标记**；等待窗口从代码首个
> 失败操作时序推导；负例用独立 fresh 目录；不可判定记 SKIP+证据。
> PR 残留章节与本文件同源同批更新。镜像 tag/REF 以执行时实际值为准（下方字面量为当前被测 commit）。

## 项 1：SELinux enforcing 宿主（Fedora/RHEL）

### 前置

- 宿主 SELinux enforcing 且 podman 启用标签（`podman info` SELinuxEnabled=true）；可达 ghcr.io 与即梦 CDN。
- 正例与负例**各自独立 fresh 目录**（负例复用正例目录会被 `:Z` 私有 MCS 类别污染，产生迷惑中间态——实测教训）。

### 执行（正例：私有标签 :Z）

```bash
getenforce   # 前置确认：期望 Enforcing
IMAGE=ghcr.io/hinnyuu/jmapi:pr-1
mkdir -p /tmp/jm-res-pos/{config,state,output}
printf 'dailyCreditCap = 500\n' > /tmp/jm-res-pos/config/config.toml
podman run -d --name jm-res-pos -p 18080:8080 \
  -e JMAPI_API_KEY=jmapi-smoke-test-key \
  -e JMAPI_CLI_SOURCE=https://jimeng.jianying.com/novel-cli \
  -v /tmp/jm-res-pos/config:/config:ro,Z \
  -v /tmp/jm-res-pos/state:/state:Z \
  -v /tmp/jm-res-pos/output:/output:Z "$IMAGE"
```

### 通过标准（正例）

```bash
for i in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/readyz)" = 200 ] && break
  sleep 2
done
curl -s http://127.0.0.1:18080/readyz
# 期望：{"status":"ready","message":null}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/healthz
# 期望：200
ls -Z /tmp/jm-res-pos/state
# 期望：标签含 container_file_t（:Z 私有类别 s0:cNNN,cNNN）
stat -c '%u' /tmp/jm-res-pos/state/cli/meta.json
# 期望：与 /tmp/jm-res-pos/state 属主一致（降权生效）
```

### 执行（负例：fresh 目录 + 去掉 :Z）

```bash
podman rm -f jm-res-pos
mkdir -p /tmp/jm-res-neg/{config,state,output}
printf 'dailyCreditCap = 500\n' > /tmp/jm-res-neg/config/config.toml
podman run -d --name jm-res-neg -p 18081:8080 \
  -e JMAPI_API_KEY=jmapi-smoke-test-key \
  -e JMAPI_CLI_SOURCE=https://jimeng.jianying.com/novel-cli \
  -v /tmp/jm-res-neg/config:/config:ro \
  -v /tmp/jm-res-neg/state:/state \
  -v /tmp/jm-res-neg/output:/output "$IMAGE"
# 首个失败操作在拒绝宿主上为 config 读取（entrypoint 载 /config/config.toml，早于 fetch 的
# mkdir /state/cli；两者均先于下载）→ 证据秒级出现；容器 fail-closed 退出后日志即完整。
# 等待仅为容器启动竞态余量，上限 30s
for i in $(seq 1 15); do
  podman logs jm-res-neg 2>&1 | grep -qE 'fatal|fetch error|fetch done|cache hit' && break
  sleep 2
done
```

### 通过标准（负例）

```bash
podman logs jm-res-neg 2>&1 | grep -cE '"msg":"(fatal|fetch error)"'
# 期望：≥1（终态标记；拒绝可能发生在 config 读或 fetch 写阶段，阶段不限）
podman logs jm-res-neg 2>&1 | grep -icE 'permission|EACCES|denied'
# 期望：≥1（拒绝证据；grounding：用户 2026-11-20 fresh 目录实测 fatal EACCES config open）
```

### 不可判定分支（仅 label 关闭类宿主）

```bash
# 若上一步出现 fetch done / cache hit（无标签也写成功）：记 SKIP/inconclusive，附证据，禁记 PASS
getenforce
podman info --format '{{.Host.Security.SELinuxEnabled}}'
grep -r '^label' /etc/containers/containers.conf ~/.config/containers/containers.conf 2>/dev/null
```

### 清理

```bash
podman rm -f jm-res-pos jm-res-neg
rm -rf /tmp/jm-res-pos /tmp/jm-res-neg
```

## 项 2：Quadlet ≥4.4 宿主（systemd 用户单元 + 双栈）

### 前置

- `podman --version` ≥4.4；systemd 用户会话可用；**测试机无需 repo**——产物经 curl raw 投递（REF 字面量）。
- 8080 端口空闲；可达 ghcr.io、raw.githubusercontent.com 与即梦 CDN。

### 执行

```bash
podman --version   # 前置确认：≥4.4
loginctl enable-linger "$USER"
mkdir -p ~/.config/containers/systemd ~/.config/jmapi ~/jmapi-data/{config,state,output}
printf 'dailyCreditCap = 500\n' > ~/jmapi-data/config/config.toml
curl -fsSL https://raw.githubusercontent.com/hinnyuu/jmapi/998bd642e7cb874943b3bea90f846c458f125577/deploy/quadlet/jmapi.container \
  -o ~/.config/containers/systemd/jmapi.container
curl -fsSL https://raw.githubusercontent.com/hinnyuu/jmapi/998bd642e7cb874943b3bea90f846c458f125577/deploy/env.example \
  -o ~/.config/jmapi/env
sed -i 's/sk-REPLACE_ME/jmapi-smoke-test-key/' ~/.config/jmapi/env
sed -i 's|ghcr.io/hinnyuu/jmapi:latest|ghcr.io/hinnyuu/jmapi:pr-1|' ~/.config/containers/systemd/jmapi.container
podman pull ghcr.io/hinnyuu/jmapi:pr-1   # 显式取新镜像（Pull=newer 兜底后续 restart）
systemctl --user daemon-reload
systemctl --user start jmapi
```

### 通过标准

```bash
systemctl --user is-active jmapi
# 期望：active
curl -s http://127.0.0.1:8080/healthz
# 期望：{"status":"ok"}
curl -s 'http://[::1]:8080/healthz'
# 期望：{"status":"ok"}（双栈：两条 PublishPort 生效）
for i in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/readyz)" = 200 ] && break
  sleep 2
done
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/readyz
# 期望：200
podman exec jmapi curl -s http://127.0.0.1:8081/admin/status | python3 -m json.tool | head -12
# 期望：cli.status=ready、version 为实际版本号（如 1.0.9）
systemctl --user stop jmapi && systemctl --user start jmapi
for i in $(seq 1 15); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/readyz)" = 200 ] && break
  sleep 1
done
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/readyz
# 期望：200 且 ≤15s（重启缓存命中零网络）
```

### 清理

```bash
systemctl --user stop jmapi
rm -f ~/.config/containers/systemd/jmapi.container ~/.config/jmapi/env
systemctl --user daemon-reload
rm -rf ~/jmapi-data
podman rm -f jmapi 2>/dev/null || true
```

## 项 3：公网 Caddy WAN 侧（本开发机宿主 + 高位端口 + CI 外部视角）

### 分工与选型（v4）

- **路由策略/TLS 终止/鉴权透传已由 smoke T8 覆盖**；本项仅验 WAN 暴露面。
- **宿主 = 开发机**（agent 全控：jmapi + caddy 容器、uhub caddy 镜像）；验收验配置性质，与部署宿主无关。
- **高位端口 28443 + `tls internal` 自签 + 外部 `curl -k`**：免 ACME（80/443 硬依赖）、避开宿主既有
  80/443 服务、防火墙增量最小；**ACME 公网信任链留真实部署时验**（生产路径文档保留）。
- **site 用不可解析假域名 `jmapi-wan.test`**（可解析域名会使 caddy bind 非本地 IP 而退出，实测）；
  外部以 `--resolve` 指向公网 IP。
- **WAN 视角 = CI manual workflow `acceptance-wan.yaml`**（GitHub runner 真外部；宿主自探是 hairpin，
  负例不可用）；管理员唯一动作：安全组临时放行 28443/tcp，测毕关闭。

### 前置（管理员）

```bash
# 云安全组临时放行 28443/tcp；确认 8080/8081 对外关闭；回复确认
# agent 起栈（开发机）：jmapi(pr-1)+caddy(uhub) 于 podman 网络，caddy -p 28443:8443，
# Caddyfile 由 deploy/Caddyfile.example 生成：site jmapi-wan.test:8443 + tls internal +
# reverse_proxy <jmapi容器IP>:8080；配置须由可读 repo 的身份生成（dev 读不了 /root，实测坑）
```

### 执行（agent 触发 CI）

```bash
gh workflow run acceptance-wan.yaml -f target_ip=<EIP> -f tls_port=28443
gh run watch --exit-status   # 或 gh run view --log 判读六断言
```

### 通过标准（CI 外部执行，六断言）

```bash
# https://jmapi-wan.test:28443（--resolve 指向 EIP，-k）：
#   /healthz 200；/admin/status 404；/v1/models 401；带 key 502（上游未登录映射）
# http://<EIP>:8080/healthz 与 http://<EIP>:8081/admin/status：000（WAN 不可达）
```

### 清理（agent + 管理员）

```bash
# agent：podman rm -f jm-wan-api jm-wan-caddy；podman network rm jm-wan-net；rm -rf /tmp/jm-wan-*
# 管理员：安全组关闭 28443/tcp
# agent 复探（CI 或外部）：https 28443 与 http 8080/8081 全 000 确认关闭
```

## sign-off 记录格式

PR 评论逐项记录：`项 N：PASS/FAIL/SKIP(inconclusive) + 执行日期 + 宿主描述（发行版/podman 版本/SELinux 状态）+ 偏差说明`。
FAIL 登记 issue 并阻断 merge；SKIP 须附证据命令输出并由人工确认接受风险。
项 3 记录管理员操作确认与外网判读双方时间戳。
## 项 4：M1 live SDK 实测（真生成，花积分；须用户批准）

### 前置

- 用户批准积分额度；jmapi 容器运行且已登录（`podman exec -e HOME=/state/home … login`，见 quickstart）。
- openai SDK（任意语言）或 curl；base_url 指向服务 `/v1`。

### 执行（grounding：2026-11-20 实测 PASS，30 积分）

```bash
# images 同步（SDK images.generate 等价）
curl -s -X POST http://<host>:8080/v1/images/generations \
  -H 'Authorization: Bearer <key>' -H 'Content-Type: application/json' \
  -d '{"model":"seedream_5.0_flash","prompt":"一只橘猫坐在窗台上，窗外雨后黄昏","size":"1792x1024"}'
# 期望 200 {created,data:[{url}]}；取 url：
curl -s -o /tmp/live.png -w '%{http_code}\n' '<data[0].url>'   # 期望 200
xxd -l 4 /tmp/live.png   # 期望 89504e47（PNG magic）
# videos 异步（SDK videos.create 发 multipart，curl JSON 亦接受）
curl -s -X POST http://<host>:8080/v1/videos -H 'Authorization: Bearer <key>' \
  -H 'Content-Type: application/json' \
  -d '{"model":"Seedance_2.0_mini","prompt":"镜头缓慢推进，橘猫转头","seconds":4,"size":"854x480"}'
# 期望 200 {id,status:queued}；轮询：
curl -s http://<host>:8080/v1/videos/<id> -H 'Authorization: Bearer <key>'
# 期望 status 最终 completed（实测 ~2-4分钟；running 勿重提）
curl -s -o /tmp/live.mp4 -w '%{http_code}\n' http://<host>:8080/v1/videos/<id>/content -H 'Authorization: Bearer <key>'
# 期望 200 + content-type video/mp4
xxd -s 4 -l 4 /tmp/live.mp4   # 期望 ftyp
# 积分核对：
podman exec <container> curl -s http://127.0.0.1:8081/admin/status   # creditsToday 与 ledger 一致
```

### 通过标准

images 200+PNG magic；videos queued→completed；content 200+ftyp；creditsToday=ledger 合计
（实测 3+3+24=30；mini 480p 4s 实际 24 积分）。SDK 形态（multipart videos.create）须同过。

### 清理

```bash
podman rm -f <container>; rm -rf <bind-root> /tmp/live.png /tmp/live.mp4 <sdk-scratch>
```
