---
date: 2026-11-19T18:45+08:00
keywords: [mit, license, runtime-fetch, ffmpeg, toml, credit-cap]
scope: [project]
type: decision
status: accepted
supersedes: []
superseded_by: []
pr: ""
---

# 许可证边界与运行时 fetch（public 镜像零专有字节）

## 背景

仓库 public、MIT。镜像若构建期下载即梦产物再公开推送=再分发专有软件，超出任何自选许可授权。
用户提案：镜像不分发官方二进制，官方安装器 URL 作为必要启动参数。另议 ffmpeg 去留与配置格式。
官方安装器实测语义：每次执行都下载外层包（:189-191），release 目录存在才跳过重装（:248）。

## 决策

**运行时 fetch**：镜像层仅包装器(MIT)+Node(MIT)+Python(PSF)+基础件；启动时操作者身份从
官方源获取即梦组件，零再分发 → public 仓库 + public GHCR 镜像成立。
entrypoint cache-first：缓存 inner-sha 复验命中则零网络（正常重启不下载）；安装器仅首启/
显式 refresh/缓存失效时以 --package-file 调用；离线 bind 安装包/安装器；钉版 env 可选。
**ffmpeg 默认不入镜像**（compose/frames 是本地后期、不在标准 API 面；transcribe/upscale 服务端）；
砍掉后镜像无 copyleft 组件；WITH_FFMPEG=1 变体自担 GPL 合规；宿主后期可直接跑 state 缓存二进制。
配置 **config.toml + smol-toml**（零依赖微型 MIT 解析器）+ env 覆盖 + SIGHUP；key 独立 secret。
积分帽默认 500/天，config/env 可改，0=关闭须启动警告。NOTICE 声明许可边界与商标非背书。

## 后果

启动期网络依赖与就绪语义（readyz 503→200）；版本稳定性靠缓存+显式升级；
供应链门禁改钉基础镜像 digest + 启动期完整性复验。见 [architecture](../docs/project/architecture.md)、NOTICE。