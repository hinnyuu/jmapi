---
date: 2026-11-19T20:55+08:00
keywords: [xdg, runuser, env-leak, rootless, smoke]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# T6 根因：runuser 环境泄漏 XDG_CONFIG_HOME

## 背景

五轮 CI smoke 19 PASS/3 FAIL，T6 现场 dump 给出根因：
`faccessat /home/runner/.config/containers/storage.conf: permission denied`。
runuser 不带 -l 时保留调用者环境；alt_podman 只显式 HOME 与 XDG_RUNTIME_DIR，
runner 会话的 XDG_CONFIG_HOME 泄漏进临时用户 → podman 以 alt 身份读 runner 的配置目录。
godoword as_user 规格本就 XDG 三件套全显式，借鉴时漏了两件。

## 决策

as_podman（dev 分支）与 alt_podman 均显式 HOME + XDG_CONFIG_HOME + XDG_DATA_HOME +
XDG_RUNTIME_DIR 四件；devenv 坑清单同步。其余矩阵已全绿（19 PASS）。

## 后果

T6 临时用户 rootless 路径恢复可测；环境隔离纪律补全。见 [gates](../docs/project/gates.md)。