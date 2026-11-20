---
date: 2026-11-20T14:30+08:00
keywords: [dual-stack, ipv6, pasta, listen, quadlet, pull-newer, execution-record]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# 项 2 复跑 v6 reset 根因：容器仅 IPv4 监听；服务改双栈 ::

## 背景

用户以 f79df61a 复跑项 2：active、v4 healthz 200，但 `[::1]:8080` TCP 建立后 recv 被重置。
根因：容器内服务默认 bind 0.0.0.0（仅 IPv4）；4.3 rootlessport 将宿主 v6 翻译到容器 v4
（本机 probe 双栈通的假象来源），5.8 pasta 将宿主 v6 转发指向容器 v6 socket → 无监听 → reset。
godoword history 2320 后果段"app 内部双栈监听（[::]:8080）不变"即此前提，借鉴时漏读半句。

## 决策

业务面默认 bind `::`（Node ipv6Only=false 即双栈），无 IPv6 netns 回退 0.0.0.0 并告警
（边界校验）；双栈锚定测试（:: listen 后 v4 loopback 200，无 v6 则 skip）。
quadlet 加 `Pull=newer`（mutable tag 复跑取新镜像），runbook 项 2 加显式 podman pull 步骤；
REF 同批更新 998bd642。docs/api、architecture、wiki 两篇同步双栈事实。

## 后果

任何转发器语义下两族皆有容器 socket；项 2 待用户以 998bd642 镜像复跑 v6 断言。
教训入纪律执行：借鉴历史决策须读全后果段的前提条件。见 [architecture](../docs/project/architecture.md)。