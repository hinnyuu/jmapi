# roadmap — 里程碑

> 差异与待办记这里；当前事实记 docs/api.md 与 architecture.md。

## M0 脚手架（进行中）

仓库纪律全落地：四类文档+history+devenv 协议、docs-gate/commitlint/gitleaks/node 门禁、
CI 构建+podman rootless 冒烟、release 流水线；Containerfile（零专有零 ffmpeg）；
entrypoint：自适应降权 + config.toml + cache-first fetch + healthz/readyz + fail-closed key；
契约 fixture 脱敏入仓；smoke 矩阵本地子集。
出口：M0 PR 全绿 + 人工残留 sign-off + merge。

## M1 OpenAI 面核心

`GET /v1/models`（model list 翻译）、`POST /v1/images/generations`（同步，--wait 内完成）、
`POST /v1/videos` + `GET /v1/videos/{id}` + `GET /v1/videos/{id}/content`（异步任务表：
JSONL ledger + 启动重建索引）、产物文件服务 + HMAC 签名 URL、错误信封映射、
积分帽执行（当日 deducted 累计）、限流+并发闸。
出口：openai 官方 SDK 改 base_url 直连实测（live opt-in）+ 契约/负例测试锚定。

## M2 DashScope 面 + 音频/文本 + 管理面

DashScope 异步任务别名（`X-DashScope-Async` → task_id → `GET /api/v1/tasks/{id}`，
与 OpenAI videos 共享任务表）；`POST /v1/audio/speech`（qwen_tts；无 voice 参数文档写明）；
seed_audio 音乐/音效扩展端点；`/v1/script/outline|episode`（结构化剧本，非 chat）；
admin LAN-only：login 非交互发起/续等/status、cli refresh、config reload。
出口：双一等公民面契约测试 + dashscope 风格 curl 实测。

## M3 部署加固与公网形态（完成；项 6 SKIP deferred 用户批准，真实部署时补测）

Quadlet 单元（双栈两条 PublishPort）+ run.sh 双轨；Caddyfile.example（只反代 /v1 与 /api，
admin 不出公网）；公网默认值全量负例测试（签名 URL 过期/错 key/限流/积分帽）；
验收矩阵残留补测（SELinux enforcing、quadlet≥4.4 宿主、docker 宿主）人工 sign-off。
出口：残留清单清零 + release v0.1.0。

## 明确不做

Anthropic/chat 兼容（即梦文本为封闭 schema 的结构化剧本工具，无自由聊天）；
画布工作流面（高级能力将来或开薄透传后门，另议）；音频分离/配音翻译（CLI 不提供）。