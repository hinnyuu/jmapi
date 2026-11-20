---
date: 2026-11-20T21:30+08:00
keywords: [branch-protection, strict, update-branch, merge-mechanics]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "6"
---

# strict=true 分支同步机制注记（PR #6 实证）

## 背景

PR #6 CI 全绿但 merge 被拒（提示 --admin）：根因 required_status_checks.strict=true
要求 PR 分支与 main 同步；PR #5 merge 后 main 前进致 PR #6 分支落后。
保护 allow_force_pushes=false 故不可 rebase 强推。

## 决策

维护期 merge 前固定动作：`gh pr update-branch <N>` → CI 重跑绿 → squash merge。
注记入 roadmap 维护段；后台链纪律补"merge 前复查分支同步"。

## 后果

多 PR 并行维护流程明确；避免误用 --admin 绕过保护。见 [roadmap](../docs/project/roadmap.md) 维护段。
