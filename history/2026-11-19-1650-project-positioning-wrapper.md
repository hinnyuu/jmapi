---
date: 2026-11-19T16:50+08:00
keywords: [jimeng, installer, wrapper, podman, ghcr]
scope: [project]
type: decision
status: accepted
supersedes: []
superseded_by: []
pr: ""
---

# 项目定位：即梦 CLI 的 API 包装器与干净安装研究

## 背景

官方安装命令 `curl …/novel-cli | bash` 会改 shell rc、向宿主 agent 目录注入 Skill 符号链接、
发安装遥测。研究确认本体为静态链接 Go 二进制 + Node canvas runtime + Skill 文档，
**非 Python 包**（conda/uv/pip 不适用）；安装器有 SHA-256 校验与路径穿越防护，
且支持 --prefix/--bin-dir/--skills-dir/--no-modify-path 与遥测开关。
凭据固定落 `$HOME/.local/share/dreamina_novel_cli/`，HOME 覆盖可完全隔离。

## 决策

项目定位为**包装器**：不重实现即梦协议，把官方 CLI 原封不动包成 HTTP API 供局域网调用；
签名/设备密钥/任务恢复留在官方二进制。仓库 hinnyuu/jmapi + GitHub Actions 构建镜像推 GHCR。
临时隔离安装（HOME 覆盖 + 单目录布局）仅用于研究实测，阵地转移后退役。

## 后果

包装层复杂度集中在状态/并发/长任务翻译；CLI 的 `-j` JSON 信封成为契约锚点。
实测与契约 fixture 成为测试基础。见 [architecture](../docs/project/architecture.md)。