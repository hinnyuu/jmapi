---
date: 2026-11-20T19:32+08:00
keywords: [m2-live, pass, credits, script-out-file, write-error-semantics, runbook-grounding]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "3"
---

# M2 live 实测 PASS（17 积分）与 script 落盘三缺陷修复记录

## 背景

用户批准 M2 live（估 ~15）。实测 DashScope 图像任务/speech/generations 全 PASS；
script outline 上游完成但 API 侧不 settle，逐层抓出三缺陷：①/v1/jobs 只 poll video 不 poll
script；②CLI --out 目录须预建；③**script --out 是单 md 文件路径**——传目录致 CLI 把目录
rename 进自身 old/（EINVAL）；且落盘失败被误标生成失败（上游已扣费，hint 明示勿重提）。
修复后既有 job 经 API 轮询 settle completed、outline.md 签名 URL 取回 200+正文；
creditsToday 17=3+5+3+6 与 ledger 一致。另修 completed 结算清除历史 error（中心化 jobs.update）。

## 决策

pollIfNeeded 共享于 /v1/jobs；ensureOutDir 预建；script --out 文件路径+subkind 记录；
isWritePathError → in_progress+retryable 语义分离；jobs.update completed 清 error。
契约负例锚定（script running→settle、--out 须 .md、writefail 保持 in_progress、error null）。
runbook 项 5 以实测 grounding 回写（含 script_bird 轮询窗口 ≥300s 提示）。

## 后果

M2 验收闭环：56 契约 + smoke 19/19 + CI 全绿 + live PASS。sign-off 代录后 merge PR #3。
过程自省：曾一次红推送（负例自身设计 bug）随即纠正；链曾拿旧镜像继续（watch 被 TLS 挡）→
链加 CI 不绿即中止门禁。见 [runbook](../wiki/deploy/acceptance-runbook.md) 项 5。