---
date: 2026-11-20T14:16+08:00
keywords: [quadlet, publishport, dual-stack, bind-conflict, execution-record]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# quadlet 双栈 bind 冲突修复与项 1 正负例用户实测 PASS 记录

## 背景

用户 trailblazer（podman 5.8.7，quadlet 经 godoword 验证可用）执行项 2 失败：
systemctl --user start jmapi 控制进程退出错误。同轮用户报告项 1 正例与 fresh 负例
**全部符合预期**（负例 fatal EACCES config open，见 history 1400）。
对照同宿主已验证 godoword 单元：单条 bare PublishPort。本机 clean probe（fresh 端口）：
bare 单条 v4/v6 皆 200（4.3 rootless 已双栈）；bare+[::] 必报
`rootlessport listen tcp 0.0.0.0:PORT bind: address already in use` → 复现用户失败模式。
godoword history 2320 的两条写法适用于当时 V6ONLY=1 的旧 pasta 配置，不适用当前验证宿主。

## 决策

quadlet 改单条 bare `PublishPort=8080:8080`（删 [::] 行）+ TimeoutStartSec=300（首启 fetch）；
quickstart/architecture 同步双栈事实；runbook REF 字面量同批更新至 f79df61a（产物变更同批纪律）。
项 1 正负例用户实测 PASS 记录入 status；sign-off 仍待用户 PR 确认。

## 后果

项 2 待用户以新 REF 复跑；双栈断言（[::1] healthz）在 bare 单条下仍成立。
见 [quadlet](../deploy/quadlet/jmapi.container)、[runbook](../wiki/deploy/acceptance-runbook.md) 项 2。