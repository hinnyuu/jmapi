---
date: 2026-11-20T11:11+08:00
keywords: [runbook, acceptance, documentation-discipline, pr-body]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# 人工残留 runbook 纪律：通过标准必须含可执行命令

## 背景

用户批评 PR #1 残留清单潦草：通过标准只有散文、没有具体验证命令，等于把验收成本
转嫁给人。原"三件套"约定只要求"明确通过标准"，未规定其形态，留了散文空子。

## 决策

立 runbook 纪律（conventions 新节 + gates 自查第 7 项）：每项残留验收四段全代码块——
前置（含具体镜像 tag）、执行命令、通过标准（**具体命令+期望输出**，含负例与轮询上限）、
清理（一一对应）。常设 runbook 入仓 wiki/deploy/acceptance-runbook.md（SELinux 正负例/
Quadlet 双栈+缓存重启/公网 Caddy 外网负例，含 sign-off 记录格式）；PR 残留章节与其
同源同批、完整嵌入不得只留链接。PR #1 正文按此重写。

## 后果

人工验收可整段复制执行、期望输出可客观比对；散文式标准从此门禁自查不合格。
见 [conventions](../docs/project/conventions.md#人工残留-runbook-纪律)、
[runbook](../wiki/deploy/acceptance-runbook.md)。