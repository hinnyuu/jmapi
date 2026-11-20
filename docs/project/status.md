# status — live 交接状态

> 每完成有意义步骤更新；收工前确认反映现实。环境事实见 devenv.md（gitignored）。
> M0 全过程细节见 history/（2026-11-19/20 各条），本文件只留 live 交接。

- updated: 2026-11-20T15:40+08:00

## 当前里程碑

**M1 OpenAI 面核心**（见 [roadmap](roadmap.md)）。M0 已 squash merge（e9d7972）+ release 绿
（main 镜像 latest/sha + same-tree 重冒烟）；三项残留验收全 PASS（sign-off 代录评论在 PR #1）。

## done（M1）

- src/jobs.mjs（JSONL ledger+重建+UTC 积分帽累计）、src/files.mjs（HMAC 签名 URL+防穿越）、
  src/routes/openai.mjs（models/images 同步/videos 异步/content/jobs 扩展+错误映射）、
  server guards（限流/并发闸/413 drain）；entrypoint 注入 JobStore/outputDir。
- 45/45 单元契约测试（签名端到端、积分帽/限流/并发/坏 body/穿越/过期负例）；lint 0。
- smoke T1/T8 与 ci wan/acceptance-wan/runbook 的 501 期望同步为 502（上游未登录映射）。
- docs/api.md、architecture.md、wiki/user/api.md 同步 M1 当前事实。

## in-flight

- M1 PR #2：CI 六 job 全绿 + 本机 dev rootless smoke 19/19（pr-2 镜像）；待用户 live 批准 + sign-off + approve。

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