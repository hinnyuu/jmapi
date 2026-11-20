# 生产部署指南（个人公网形态）

> 验收期形态（高位端口+自签）见 [acceptance-runbook](acceptance-runbook.md) 项 3/4/5；
> 本页为真实长期运行形态：自有域名 + ACME + 80/443。

## 拓扑

```
WAN ── 80/443 ── Caddy（ACME 自动 HTTPS）── 127.0.0.1:8080 ── jmapi 容器
                                                    admin 8081 仅容器 loopback（podman exec 访问）
安全组/防火墙：仅 80/443 入站；8080/8081 不对 WAN
```

## 步骤

```bash
# 1 域名 DNS A/AAAA 指向宿主公网 IP（或测试期 <IP>.nip.io 泛解析）
# 2 安全组仅放 80/443（ACME http-01/tls-alpn 依赖）；确认 8080/8081 关闭
# 3 起 jmapi（quadlet 或 run.sh；Pull=newer 保证升级取新镜像）
loginctl enable-linger "$USER"
bash deploy/run.sh   # 或 quadlet：cp deploy/quadlet/jmapi.container ~/.config/containers/systemd/
# 4 登录（一次；凭据落 /state/home 持久化）
podman exec -e HOME=/state/home -it jmapi /state/cli/bin/jimeng-novel login --non-interactive -j
podman exec -e HOME=/state/home -it jmapi /state/cli/bin/jimeng-novel login --wait --device-code '<dc>' --timeout 600s -j
# 5 Caddy 站点（域名替换）+ 安全头（见 Caddyfile.example）
sed 's/jmapi.example.com/<你的域名>/' deploy/Caddyfile.example | sudo tee /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
# 6 外网验证（runbook 项 3 六断言，https 无 -k：ACME 真证书）
```

## 运维

- **升级**：镜像 mutable tag + `Pull=newer` → `systemctl --user restart jmapi`（或 podman rm+run）；
  CLI 组件升级显式 `JMAPI_CLI_REFRESH=1` 或 admin `POST /admin/cli/refresh`；重启缓存命中零下载。
- **备份**：/state 卷含凭据（home/）、任务 ledger、CLI 缓存；定期快照（凭据敏感，备份加密存放）；
  /output 产物按需归档；config.toml 入配置管理（不含 key）。
- **key 管理**：key 经 env/secret 文件注入（mode 600）；轮换=改 env+restart；泄漏立即轮换。
- **监控**：/healthz（存活）/readyz（就绪）；admin/status（creditsToday/login/cli）；
  访问日志 JSON（method/path/status/ms，不含 key/签名）；积分帽 429 告警接日志采集。
- **SELinux 宿主**：bind 一律 :Z（凭据卷私有禁共享）；enforcing 验收见 runbook 项 1。
- **故障**：上游未登录→502 upstream_authentication_required（admin login 续期）；
  落盘失败 error.retryable→轮询同 job 勿重提；CDN 不可达→readyz 503 退避重试。

## 公网默认值清单（SECURITY.md 同源）

强 key fail-closed；admin 不出公网；限流+并发闸；积分帽 500/天 UTC；签名 URL 1h；
TLS 仅边缘；日志脱敏；no-store/nosniff 头；Caddy 隐藏 Server/禁 referrer。