---
date: 2026-11-19T20:30+08:00
keywords: [demotion, uid-map, rootless, overflow, smoke-diagnostics]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# 降权映射缺陷修正：容器侧属主即目标，不做二次映射

## 背景

PR #1 CI smoke 全矩阵红（healthz 000 / ExitCode 1）。本机复现定位：computeDemotion
把 stat 得到的**容器侧** uid 当作宿主 uid 再查 uid_map 二次映射——rootless 下 dev 属主
bind 在容器内显示 uid 0，反查映射必失败 → EACCES fatal → 服务起不来。
godoword 规格的本意是"以属主映射的容器 uid 运行"，stat 结果本身已是该 uid。

## 决策

rootless 分支直接以 stat 的容器侧 uid/gid 为降权目标（容器 0 写出的文件宿主即归 dev）；
uid_map 仅用于区分 rootful（identity）与识别溢出属主 65534（宿主 root 属主 bind 在
rootless 下无映射 → EACCES 明确提示，fail-closed 保留）。rootful 分支不变。
单测同步改写（含 65534 负例，rootOnly）；smoke cleanup 失败时先 dump 自有容器日志
再清理（红必留现场摘要）。architecture 同步当前事实。

同轮本机预验再抓一缺陷：官方安装器 release 目录名带 sha12 后缀（`<bundle>-<sha12>`），
fetch _post-install 校验与 cacheHit 误用裸 bundle 名 → 校验失败且缓存永不命中。
修正：readdir 实际目录名入 meta.release，cacheHit 以其复验。

## 后果

M0 入口在 rootless/rootful 全矩阵可启动；诊断能力补齐。缺陷≠重议：降权选型不变，
仅修正实现语义。见 [architecture](../docs/project/architecture.md)。