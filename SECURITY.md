# SECURITY.md — 威胁模型与安全默认值

## 威胁模型

- **LAN 部署**：局域网内可信度有限——任何能访问者持 key 即可烧账号积分。
- **公网反代（Caddy，个人使用）**：API key 成为互联网凭据；key 泄漏=积分损失；
  管理面（login/refresh）若出公网=授权骚扰面。故 admin 默认只绑 127.0.0.1。
- **单账号集中**：生成频率与积分消耗集中于一个即梦账号；注意即梦使用条款边界。

## 安全默认值（fail-closed）

1. 无 `JMAPI_API_KEY` 拒绝启动；key 建议 `openssl rand -hex 32`；常数时间比较。
2. admin :8081 只绑**容器内** loopback 且不 publish（宿主经 podman exec 访问）；
   LAN 直连须显式 JMAPI_ADMIN_BIND opt-in 并自限来源；Caddy 只反代 /v1、/api、/files。
3. per-key 限流 + 全局并发闸 + 请求体上限（429/413 标准信封）。
4. 积分帽默认 500/天（UTC 日界，仅拦新提交）；config/env 可改；0=关闭须启动警告。
5. 产物 URL HMAC 签名短期有效（默认 1h）；过期 403。
6. TLS 只在边缘（Caddy 自动 HTTPS）；服务明文端口不暴露 WAN。
7. 日志 JSON 脱敏：Authorization/token/cookie/device-key 一律不落日志。

## 凭据处理铁律

- **私有凭据永不入库**：gitleaks CI 全历史 + 禁入路径门禁 + GitHub secret
  scanning/push protection（public 仓库启用）；fixture 脱敏假 id。
- live 凭据只在 /state 挂载卷（CLI 自管文件，0600）；卷私有 `:Z`，禁止多容器共享。
- CI 永不登录真实账号、永不生成；live 测试仅本机 `JMAPI_LIVE=1` opt-in。
- devenv.md 只记凭据路径不记值，gitignored。

## 供应链

- 镜像零专有字节；启动期 fetch 官方包并 SHA-256 校验（checksums.txt），缓存每次启动复验。
- versions.lock 钉基础镜像 digest 与 CLI 包 sha；构建期比对不符即红。
- CI 工具钉版本 + checksums 校验后执行（gitleaks）。
- 依赖许可证白名单门禁；npm audit high 以上红。

## 响应与日志加固（M3）

- API JSON：`Cache-Control: no-store` + `X-Content-Type-Options: nosniff`；
  签名文件：nosniff + `private, max-age=3600`；Caddy 边缘加 nosniff/no-referrer/隐藏 Server。
- 访问日志 JSON：method/path/status/ms，**不含 key/签名/query**；凭据类字段一律 redact。
- admin 绑定非 loopback 时启动告警（显式 opt-in 须自限来源）。
- 生产形态（ACME/安全组/备份/升级/监控）见 [wiki/deploy/production.md](wiki/deploy/production.md)。

## 报告漏洞

请勿在公开 issue 贴凭据或可利用细节。通过 GitHub 私有漏洞报告
（Security → Report a vulnerability）或联系维护者；含复现步骤与影响面。