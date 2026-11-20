# 人工残留验收 runbook（宿主依赖项）

> 本 runbook 覆盖 CI/本机无法验收的宿主项：SELinux enforcing、Quadlet≥4.4、公网 Caddy。
> 格式纪律见 [conventions](../../docs/project/conventions.md#人工残留-runbook-纪律)：
> 每项含前置、执行命令、通过标准（**具体命令+期望输出**，含负例）、清理，全部代码块、可整段复制。
> PR 残留章节须与本文件同源同批更新。镜像 tag 以执行时 PR/release 实际 tag 为准（下方以 `pr-1` 示例）。

## 项 1：SELinux enforcing 宿主（Fedora/RHEL）

### 前置

- 宿主 SELinux enforcing；podman 已装（rootful 或 rootless 均可）；可达 ghcr.io 与即梦 CDN。
- 云安全组/防火墙放行 loopback 即可（本项不暴露公网）。

### 执行（正例：私有标签 :Z）

```bash
getenforce   # 前置确认：期望 Enforcing
IMAGE=ghcr.io/hinnyuu/jmapi:pr-1
mkdir -p /tmp/jm-res1/{config,state,output}
printf 'dailyCreditCap = 500\n' > /tmp/jm-res1/config/config.toml
podman run -d --name jm-res1 -p 18080:8080 \
  -e JMAPI_API_KEY=jmapi-smoke-test-key \
  -e JMAPI_CLI_SOURCE=https://jimeng.jianying.com/novel-cli \
  -v /tmp/jm-res1/config:/config:ro,Z \
  -v /tmp/jm-res1/state:/state:Z \
  -v /tmp/jm-res1/output:/output:Z "$IMAGE"
```

### 通过标准（正例）

```bash
# 就绪轮询（首启 fetch 约 37MB；≤180s）
for i in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/readyz)" = 200 ] && break
  sleep 2
done
curl -s http://127.0.0.1:18080/readyz
# 期望：{"status":"ready","message":null}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/healthz
# 期望：200
ls -Z /tmp/jm-res1/state
# 期望：标签含 container_file_t（:Z 私有类别 s0:cNNN,cNNN）
stat -c '%u' /tmp/jm-res1/state/cli/meta.json
# 期望：与 /tmp/jm-res1/state 属主一致（降权生效）
```

### 执行（负例：去掉 :Z）

```bash
podman rm -f jm-res1
podman run -d --name jm-res1-nolabel -p 18081:8080 \
  -e JMAPI_API_KEY=jmapi-smoke-test-key \
  -e JMAPI_CLI_SOURCE=https://jimeng.jianying.com/novel-cli \
  -v /tmp/jm-res1/config:/config:ro \
  -v /tmp/jm-res1/state:/state \
  -v /tmp/jm-res1/output:/output "$IMAGE"
sleep 15
```

### 通过标准（负例）

```bash
curl -s http://127.0.0.1:18081/readyz
# 期望：503 且持续（fetch 写 state 被 SELinux 拒绝）
podman logs jm-res1-nolabel 2>&1 | grep -icE 'permission|EACCES|denied'
# 期望：≥1（日志含权限拒绝证据）
sudo ausearch -m AVC -ts recent 2>/dev/null | grep -c container_t
# 期望：≥1（可选：AVC  denial 记录佐证）
```

### 清理

```bash
podman rm -f jm-res1 jm-res1-nolabel
rm -rf /tmp/jm-res1
```

## 项 2：Quadlet ≥4.4 宿主（systemd 用户单元 + 双栈）

### 前置

- `podman --version` ≥4.4；systemd 用户会话可用；仓库 clone 在手（取 deploy/ 产物）。
- 8080 端口空闲；可达 ghcr.io 与即梦 CDN。

### 执行

```bash
podman --version   # 前置确认：≥4.4
loginctl enable-linger "$USER"
mkdir -p ~/.config/containers/systemd ~/.config/jmapi ~/jmapi-data/{config,state,output}
printf 'dailyCreditCap = 500\n' > ~/jmapi-data/config/config.toml
cp deploy/quadlet/jmapi.container ~/.config/containers/systemd/
cp deploy/env.example ~/.config/jmapi/env
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

## 项 3：公网 Caddy 反代（个人域名，admin 不出公网）

### 前置

- 个人域名 DNS 已指向宿主；Caddy 已装（distro 服务或二进制）；jmapi 已按项 2 或 deploy/run.sh 运行于 LAN。
- **云安全组/防火墙仅放行 80/443**（8080/8081 明文端口不对 WAN 开放）——本项负例依赖此前提。
- 从**外网**执行通过标准命令（手机热点/另一台主机），不在宿主自测。

### 执行

```bash
sed 's/jmapi.example.com/<你的域名>/' deploy/Caddyfile.example | sudo tee /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
# 期望：Valid configuration
sudo systemctl reload caddy   # 或：sudo caddy reload --config /etc/caddy/Caddyfile
```

### 通过标准（外网执行）

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<你的域名>/admin/status
# 期望：404（Caddy 不代理 admin）
curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 http://<公网IP>:8081/admin/status
# 期望：000（连接拒绝/超时：admin 未暴露 WAN）
curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 http://<公网IP>:8080/healthz
# 期望：000（明文业务端口未暴露 WAN）
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
# jmapi 本体若不再需要：systemctl --user stop jmapi（项 2 清理段）
```

## sign-off 记录格式

PR 评论逐项记录：`项 N：PASS/FAIL + 执行日期 + 宿主描述（发行版/podman 版本/SELinux 状态）+ 偏差说明`。
FAIL 项登记 issue 并阻断 merge；SKIP 须说明理由并由人工确认接受风险。