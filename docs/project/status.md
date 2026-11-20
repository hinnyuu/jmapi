# status — live 交接状态

> 每完成有意义步骤更新；收工前确认反映现实。环境事实见 devenv.md（gitignored）。
> M0 全过程细节见 history/（2026-11-19/20 各条），本文件只留 live 交接。

- updated: 2026-11-20T15:40+08:00

## 当前里程碑

**M3 部署加固与公网生产形态**（见 [roadmap](roadmap.md)）。M0/M1/M2 已 merge + release 绿
（M2 live PASS 17 积分，sign-off 代录在 PR #3）。

## done（M3）

- 安全头（no-store/nosniff/private max-age）、脱敏访问日志、admin 非 loopback 告警；
  Caddyfile 生产 ACME+安全头；wiki/deploy/production.md（拓扑/备份/升级/监控/故障）；
  SECURITY 加固节；runbook 项 6（生产 ACME 残留，须用户域名或批准 SKIP）。
- 契约负例：headers+访问日志不含 key/query。

## in-flight

- M3 PR + CI + smoke；残留项 6 待用户决策（域名+80/443 或 SKIP deferred）。

## 下一动作

1. M1 PR → CI 全绿 → 本机 dev rootless smoke（pr-2 镜像）。
2. **live SDK 实测（openai SDK 改 base_url 真生成）花积分 → 呼叫用户批准后才跑**（M1 残留项）。
3. 用户 sign-off + approve + squash merge → release 重冒烟 → M2（DashScope 面+音频/文本+admin login）。

## blocked / 待拍板决策

- live 生成测试待用户批准（积分触发器）；其余无待拍板项。

## 近期上下文

- api.github.com 间歇 TLS 超时：gh 操作有界重试纪律；push 走 SSH 不受影响。
- 分支保护 reviews=0（godoword 先例：单人仓库作者不可 self-approve；人工 sign-off 走 PR 评论纪律）。
- 本机 podman 4.3.1 无 quadlet；rootless 不支持运行中 network connect；跨容器 DNS 不接管（用 IP）。
- WAN 验收变量已删；acceptance-wan.yaml merge 后可 dispatch 重复执行。