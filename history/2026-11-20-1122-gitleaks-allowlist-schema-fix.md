---
date: 2026-11-20T11:22+08:00
keywords: [gitleaks, allowlist, schema, regexTarget, entropy]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# gitleaks 白名单 schema 缺陷：单数 [allowlist] 才生效

## 背景

九轮 CI secrets 红：runbook 的 `Authorization: Bearer jmapi-smoke-test-key` 命中
curl-auth-header。本机钉版复现实验链：①单文件"绿"是空扫描假象（--source 文件不扫）；
②全 regex  omnivorous 实验证明复数 `[[allowlists]]` 在 v8.21.2 被整体忽略，
单数 `[allowlist]` 生效；③regexTarget 默认 match，curl-auth-header 的 match 窗口
不含 key 本身，须显式 regexTarget="secret"。前八轮绿的真因：smoke.sh 的
generic-api-key 熵 3.446 低于阈值 3.5 未触发——白名单从未工作过。

## 决策

.gitleaks.toml 改单数 [allowlist] + regexTarget="secret"；负例锚定：植入假 AWS/GitHub
key 仍命中（白名单非万能豁免）。gates 注记 schema 与 regexTarget 陷阱。
教训：门禁配置自身须有负例验证，"绿"不等于"在扫描"。

## 后果

secrets 门禁首次真正生效于文档中的测试凭据形态；CI 第十轮验证。
见 [gates](../docs/project/gates.md)。