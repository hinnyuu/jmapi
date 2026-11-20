# 历史索引

> 由 scripts/docs-gate 从 frontmatter 生成（派生物，勿手改）。规则见 conventions.md。

共 15 条。

- [项目定位：即梦 CLI 的 API 包装器与干净安装研究](2026-11-19-1650-project-positioning-wrapper.md) — 2026-11-19T16:50:00+08:00 · decision · accepted · scope: project · keywords: jimeng, installer, wrapper, podman, ghcr
- [API 兼容面选型：OpenAI 与 DashScope 双一等公民](2026-11-19-1710-api-compatibility-surfaces.md) — 2026-11-19T17:10:00+08:00 · decision · accepted · scope: project · keywords: openai, dashscope, api, async, compatibility
- [全类型实测锚点（图/视频/音频/文本/并发/幂等）](2026-11-19-1740-live-test-anchors.md) — 2026-11-19T17:40:00+08:00 · decision · accepted · scope: project · keywords: live-test, latency, concurrency, idempotency, fixtures
- [开发纪律与 podman rootless/SELinux 策略](2026-11-19-1820-discipline-podman-strategy.md) — 2026-11-19T18:20:00+08:00 · decision · accepted · scope: project · keywords: podman, rootless, selinux, ci, gates, conventional-commits
- [许可证边界与运行时 fetch（public 镜像零专有字节）](2026-11-19-1845-license-runtime-fetch.md) — 2026-11-19T18:45:00+08:00 · decision · accepted · scope: project · keywords: mit, license, runtime-fetch, ffmpeg, toml, credit-cap
- [存储三分、自适应降权与 godoword 约定借鉴（许可防火墙）](2026-11-19-1900-storage-demotion-godoword-borrow.md) — 2026-11-19T19:00:00+08:00 · decision · accepted · scope: project · keywords: bind-mount, demotion, uid-map, godoword, agpl-firewall, acceptance
- [admin 面可达性缺陷修正：容器 loopback 不 publish](2026-11-19-2005-admin-loopback-publish-fix.md) — 2026-11-19T20:05:00+08:00 · change · accepted · scope: project · keywords: admin, loopback, publish, port, defect
- [降权映射缺陷修正：容器侧属主即目标，不做二次映射](2026-11-19-2030-demotion-container-side-uid-fix.md) — 2026-11-19T20:30:00+08:00 · change · accepted · scope: project · keywords: demotion, uid-map, rootless, overflow, smoke-diagnostics
- [smoke 三处测量缺陷修正与 T6 诊断补强](2026-11-19-2045-smoke-measurement-fixes.md) — 2026-11-19T20:45:00+08:00 · change · accepted · scope: project · keywords: smoke, race, proc-status, exec, diagnostics, version
- [T6 根因：runuser 环境泄漏 XDG_CONFIG_HOME](2026-11-19-2055-xdg-env-leak-fix.md) — 2026-11-19T20:55:00+08:00 · change · accepted · scope: project · keywords: xdg, runuser, env-leak, rootless, smoke
- [人工残留 runbook 纪律：通过标准必须含可执行命令](2026-11-20-1111-runbook-discipline.md) — 2026-11-20T11:11:00+08:00 · change · accepted · scope: project · keywords: runbook, acceptance, documentation-discipline, pr-body
- [gitleaks 白名单 schema 缺陷：单数 [allowlist] 才生效](2026-11-20-1122-gitleaks-allowlist-schema-fix.md) — 2026-11-20T11:22:00+08:00 · change · accepted · scope: project · keywords: gitleaks, allowlist, schema, regexTarget, entropy
- [runbook v3：日志证据通道、fresh 目录负例、REF 字面量、Caddy 拆分](2026-11-20-1310-runbook-v3.md) — 2026-11-20T13:10:00+08:00 · change · accepted · scope: project · keywords: runbook, selinux, fresh-dir, podman-logs, ref-literal, caddy-split
- [fetch 异步化缺陷修复与 T8 自测落地（宿主 quirks 链）](2026-11-20-1314-fetch-async-t8-quirks.md) — 2026-11-20T13:14:00+08:00 · change · accepted · scope: project · keywords: fetch, async, event-loop, sigterm, t8, caddy, rootless, slirp4netns, aardvark
- [项 1 负例用户实测记录与终态标记修正](2026-11-20-1400-selinux-negative-execution-record.md) — 2026-11-20T14:00:00+08:00 · change · accepted · scope: project · keywords: selinux, negative, execution-record, fatal, config-read, terminal-marker
