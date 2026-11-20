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
curl -fsSL https://raw.githubusercontent.com/hinnyuu/jmapi/f79df61a0aeab7e184d83d6a464863297420204d/deploy/quadlet/jmapi.container \
  -o ~/.config/containers/systemd/jmapi.container
curl -fsSL https://raw.githubusercontent.com/hinnyuu/jmapi/f79df61a0aeab7e184d83d6a464863297420204d/deploy/env.example \
  -o ~/.config/jmapi/env
sed -i 's/sk-REPLACE_ME/jmapi-smoke-test-key/' ~/.config/jmapi/env
sed -i 's|ghcr.io/hinnyuu/jmapi:latest|ghcr.io/hinnyuu/jmapi:pr-1|' ~/.config/containers/systemd/jmapi.container
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

## 项 3：公网 Caddy WAN 侧（管理员协同；路由策略已由 smoke T8 自动化）

### 前置

- **路由策略/TLS 终止/鉴权透传已由自动化冒烟 T8 覆盖**（caddy 容器 + `tls internal` 自签 + loopback，
  见 scripts/acceptance/smoke.sh；CI 与本机均跑）。本项仅验 WAN 暴露面。
- 个人域名 DNS 指向宿主；Caddy 已装；jmapi 已按项 2 或 deploy/run.sh 运行于 LAN。
- **云安全组/防火墙仅放行 80/443**——由管理员执行并确认（下方命令）。
- 通过标准命令从**外网**执行（手机热点/另一主机）；管理员操作与 agent 判读在线协同。

### 执行（管理员操作，agent 提供命令并判读输出）

```bash
# 管理员：安全组/防火墙仅放 80/443（以云厂商 CLI 或控制台为准），完成后回复确认
# 管理员：部署站点（域名替换），reload
sed 's/jmapi.example.com/<你的域名>/' deploy/Caddyfile.example | sudo tee /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
# 期望：Valid configuration
sudo systemctl reload caddy   # 或：sudo caddy reload --config /etc/caddy/Caddyfile
```

（测试机无 repo 时，Caddyfile.example 同项 2 方式 curl raw 投递，REF 字面量同上。）

### 通过标准（外网执行）

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<你的域名>/admin/status
# 期望：404（Caddy 不代理 admin）
curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 http://<公网IP>:8081/admin/status
# 期望：000（连接拒绝/超时：admin 未暴露 WAN）
curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 http://<公网IP>:8080/healthz
# 期望：000（明文业务端口未暴露 WAN；依赖安全组前提）
curl -s https://<你的域名>/healthz
# 期望：{"status":"ok"}（TLS 自动 HTTPS 生效）
curl -s -o /dev/null -w '%{http_code}\n' https://<你的域名>/v1/models
# 期望：401（无 key）
curl -s -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer jmapi-smoke-test-key' https://<你的域名>/v1/models
# 期望：501（M0 未实现；M1 后为 200）
```

### 清理

```bash
sudo rm -f /etc/caddy/Caddyfile   # 或移除站点块恢复原配置
sudo systemctl reload caddy
# jmapi 本体若不再需要：按项 2 清理段
```

## sign-off 记录格式

PR 评论逐项记录：`项 N：PASS/FAIL/SKIP(inconclusive) + 执行日期 + 宿主描述（发行版/podman 版本/SELinux 状态）+ 偏差说明`。
FAIL 登记 issue 并阻断 merge；SKIP 须附证据命令输出并由人工确认接受风险。
项 3 记录管理员操作确认与外网判读双方时间戳。