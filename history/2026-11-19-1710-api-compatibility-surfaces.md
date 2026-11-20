---
date: 2026-11-19T17:10+08:00
keywords: [openai, dashscope, api, async, compatibility]
scope: [project]
type: decision
status: accepted
supersedes: []
superseded_by: []
pr: ""
---

# API 兼容面选型：OpenAI 与 DashScope 双一等公民

## 背景

"像 dashscope/openai 那样调用"存在三档粒度：薄透传（远程 exec）、自有 REST（新 schema）、
标准兼容门面（抄现成线格式，SDK 改 base_url 直连）。用户要第三档且双面一等公民。
OpenAI/Anthropic 旗舰端点是同步文本聊天，与即梦异步媒体生成形状不符；
实测 `script outline` inputSchema 封闭（additionalProperties:false、episode_num 必填），
**无自由聊天模式**。

## 决策

兼容目标为家族内生成类端点：OpenAI `images/generations`（同步）、`videos`（Sora 式异步
任务对象）、`audio/speech`（qwen_tts）、`models`；DashScope 原生异步任务面
（X-DashScope-Async → task_id → /api/v1/tasks/{id}）共享同一任务表。
**不做 Anthropic/chat 兼容**。门面架在一次性命令上（generate-* + query-result、script trio），
调用方无状态，不暴露画布/项目/节点。图片同步（实测 38-40s）、视频异步（p50 221s 量级）。

## 后果

任务表（task id ↔ thread_id/run_id）成为核心组件；错误信封/参数翻译层是主要工作量。
见 [docs/api.md](../docs/api.md)。