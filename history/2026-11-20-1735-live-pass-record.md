---
date: 2026-11-20T17:35+08:00
keywords: [live-test, sdk, pass, credits, runbook-grounding]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "2"
---

# M1 live SDK 实测 PASS 记录（30 积分）与 runbook 项 4 回写

## 背景

用户批准 live 实测（估 <30 积分）。历经两缺陷修复（SDK multipart 形态、凭据 HOME 落点）
与三次授权窗口（两次过期/未及确认，一次瞬时上游 502 后判明 40011 未确认），最终全链路 PASS：
models 35；images.generate 200 + 签名 URL 取回 PNG（89504e47）；videos.create queued →
retrieve completed → content 200 video/mp4（ftyp）。ledger 合计 3+3+24=30 积分
（mini 480p 4s 实际 24，略超估算 20；总额 30 与批准边界持平，如实披露）。

## 决策

runbook 新增项 4（live SDK 实测）：前置批准+登录、执行命令（curl 等价+SDK multipart 须同过）、
通过标准（magic/状态/积分核对）、清理；全部以本次实测 grounding 回写（纪律执行）。
sign-off 代录（用户授权"实测没问题就 sign-off+approve+squash merge"）后 merge PR #2。

## 后果

M1 验收闭环：契约 47 + smoke 19/19 + CI 全绿 + live PASS。M2 开工条件具备。
见 [runbook](../wiki/deploy/acceptance-runbook.md) 项 4。