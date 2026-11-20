---
date: 2026-11-20T14:00+08:00
keywords: [selinux, negative, execution-record, fatal, config-read, terminal-marker]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# 项 1 负例用户实测记录与终态标记修正

## 背景

用户在 SELinux 宿主（trailblazer，用户 shiki）按 v3 fresh 目录协议复跑负例：
`demoted uid 0` 后 `fatal: 配置加载失败 EACCES open '/config/config.toml'`；
`fetch error` 计数 0、permission/EACCES/denied 计数 1。判读：拒绝发生在 **config 读取**
（entrypoint 载 ro bind，早于 fetch mkdir），容器 fail-closed 退出，未到 fetch 阶段——
负例实质 PASS（confinement 首访问即生效 + fail-closed 验证），但 v3 终态标记漏了 fatal 路径。
标签污染假设亦获间接支持：fresh 目录拒绝秒级出现，与 v1 复用目录的迷惑中间态形成对照。

## 决策

runbook 负例：等待标记与通过标准终态改为 `fatal|fetch error`（阶段不限）+ denial grep ≥1；
conventions 首失败操作时序补"含读与写"、终态标记须含全部退出路径。本条为用户执行记录
（grounding 来源），sign-off 仍待用户在 PR 确认。

## 后果

负例标准与真实退出路径对齐；期望输出全链路 grounding 完成（godoword 历史 + 本次实测）。
见 [runbook](../wiki/deploy/acceptance-runbook.md) 项 1。