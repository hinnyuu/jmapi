---
date: 2026-11-20T20:10+08:00
keywords: [m3, sign-off, skip-deferred, acme, maintenance-mode]
scope: [project]
type: decision
status: accepted
supersedes: []
superseded_by: []
pr: "4"
---

# M3 sign-off 与项 6 SKIP(deferred) 决策；项目进入维护态

## 背景

M3 机器侧完毕（57 契约、smoke 19/19、CI 全绿、门禁 0）。残留项 6（生产 ACME 真域名）
须用户域名+80/443 或显式批准 SKIP。用户选 B："我相信 caddy 不会出现这种基础问题"。

## 决策

项 6 记 **SKIP(deferred)**：延至真实部署时按 runbook 项 6 执行（真证书链、无 -k、安全头核对）；
风险接受理由：ACME 为 Caddy 成熟能力，验收期路由策略/TLS 终止/暴露面/鉴权透传已由项 3
自签形态 + T8 自动化全过。sign-off 代录（用户授权链：M0/M1/M2 实测授权 + 本次 B 决策）后
squash merge PR #4。roadmap M0-M3 全闭环，项目进入维护态：后续变更按铁律
（conventional commits + PR 全门禁 + 残留 runbook 三件套 + 积分触发器呼叫人工）。

## 后果

无活体残留；项 6 在真实部署时补测并回写 runbook（grounding 纪律不变）。
见 [runbook](../wiki/deploy/acceptance-runbook.md) 项 6、[production](../wiki/deploy/production.md)。