---
date: 2026-11-20T15:15+08:00
keywords: [item3, wan, high-port, tls-internal, hairpin, acceptance-wan, caddy-bind]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# 项 3 v4：开发机宿主 + 高位端口 + CI 外部视角（含起栈两坑）

## 背景

用户质疑项 3 为何绑 trailblazer：验收验配置性质与宿主无关；开发机 agent 全控且 uhub caddy
现成。用户提案高位端口替代 80/443（免 ACME、避既有服务冲突、防火墙增量最小），完全同意。
起栈实测两坑：①nip.io 可解析 → caddy bind 非本地 EIP 退出（T8 假域名不可解析才监听全接口）；
②sed 以 dev 身份读 /root 下 example 被拒 → Caddyfile 空 → caddy 无 site（配置须由可读 repo
身份生成）。另确认宿主自探公网 IP 为 hairpin，负例断言必须真外部视角。

## 决策

项 3 v4：宿主=开发机；28443 高位 + tls internal 自签 + curl -k（ACME 公网信任链留部署时验，
诚实标注 scope）；site 假域名 jmapi-wan.test + 外部 --resolve；WAN 视角=新增 manual workflow
acceptance-wan.yaml（六断言，输入经 env+格式校验）；管理员唯一动作=安全组临时开/关 28443
（用户已开）；清理 agent 删栈 + 管理员关端口 + 外部复探全 000。runbook 项 3 重写、gates 增第 8 项。

## 后果

项 3 零管理员设备依赖、可重复自动化；本地 sanity 200/404/401 已通；待 CI 六断言判读。
见 [runbook](../wiki/deploy/acceptance-runbook.md) 项 3、acceptance-wan.yaml。