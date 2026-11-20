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
## 维护段（M0-M3 闭环后；2026-11-20 定稿）

> 节奏：P0 随首次真实部署一次做完；P1 按 5→6→7 顺序各走一个维护 PR；P2 按需立项。
> 铁律不变：conventional commits + PR 全门禁 + 残留 runbook 三件套 + grounding + 积分触发器呼叫人工。

### P0 — 真实部署时必做

1. 补项 6 ACME 实测（runbook 项 6）：自有域名 + 安全组仅 80/443，真证书链无 -k + 安全头核对；回写 runbook。
2. 备份落地：/state 卷（凭据 home/ + ledger + CLI 缓存）加密快照定时任务；/output 按需归档；config.toml 入配置管理（不含 key）。
3. key 管理演练：轮换流程与泄漏应急（轮换 + ledger 审计）写入 production.md 运维节。
4. 监控接采集：access JSON + admin/status（creditsToday/login/cli）接告警（积分帽 429、readyz 503 持续、上游 AUTH_FAILED）。

### P1 — 近期高价值

5. input_reference 参考图上传（M2 留的 400 边界）：multipart 文件部分落盘 + CLI --image 透传（图生图/视频参考，价值最高）。
6. CLI 版本升级 runbook：versions.lock 钉版 + 升级重录脱敏 fixture + 全契约回归 + live 抽测固定流程。
7. ledger 维护：JSONL rotate/compact 任务（保留 day 汇总供积分帽审计）。
8. SELinux CI 覆盖闭合：Fedora enforcing self-hosted runner 或 container job 进矩阵（项 1 现靠宿主实测）。
9. 并发闸实证校准：压测校准 maxConcurrent 默认值（2H2G 估值 4）并写入 production.md。

### P2 — 可选扩展

10. 任务完成通知：webhook 回调或 SSE（复用任务表状态机）。
11. upscale/compose API 化（compose 需 ffmpeg → WITH_FFMPEG 变体或宿主侧；许可边界见 NOTICE）。
12. 多 key/多空间：per-key 隔离与 team-id 透传（当前单 key 单空间为个人形态诚实边界）。
13. /metrics 轻量观测（Prometheus 文本：jobs 计数/积分/延迟分位）。
14. API 版本化承诺：/v1 稳定 + breaking change 走 history + deprecation 窗口写入 docs/api.md。

### 诚实债务清单（已知边界，非缺陷）

- 限流窗口在内存，重启重置（个人形态可接受，文档注明）；签名密钥=API key，轮换即失效旧 URL。
- 单账号积分集中：条款边界与烧积分风险靠积分帽+限流+告警缓解；多人共用前须评估。
- Windows 宿主未覆盖（容器路径 Linux only）。
- 开发机 podman 4.3 无 Quadlet（生产宿主选 ≥4.4；trailblazer 5.8 已验证）。

### 维护期机制注记

- **strict=true 分支同步**：required_status_checks.strict 要求 PR 分支与 main 同步；
  多 PR 并行时每次 merge 前须 `gh pr update-branch <N>`（保护禁 force-push，不可 rebase 强推）；
  update 后 CI 重跑绿再 merge。PR #6 实证（2026-11-20）。
- **GitHub API 间歇 TLS 超时**：gh 操作有界重试；后台链须 CI 不绿即中止 + merge 前复查分支同步。
