# API 契约（当前事实）

> 双一等公民：OpenAI 兼容面与 DashScope 兼容面共享同一任务表与 CLI 执行层。
> 认证：`Authorization: Bearer <JMAPI_API_KEY>`；缺失/错误 → 401 标准错误信封。
> 就绪前业务端点 503；M0 未实现端点有 key 时 501。
> 业务面默认双栈监听（`::`，JMAPI_BIND 可覆盖）；IPv4/IPv6 loopback 与反代两族皆可达。

## M0（当前）

| 端点 | 行为 |
|---|---|
| GET /healthz | 恒 200 `{"status":"ok"}` |
| GET /readyz | CLI fetch/复验就绪 200，否则 503 `{"status":"fetching"\|"error"}` |
| /v1/*、/api/* | 无 key 401；有 key 未就绪 503；就绪但未实现 501 |
| admin :8081（容器 loopback，不 publish） | 宿主经 `podman exec jmapi curl -s http://127.0.0.1:8081/admin/status` 访问；返回 cli 就绪态、version（实际 CLI 版本号）、login 态、积分帽配置；M2 落地 login/refresh/reload；LAN 直连须显式 JMAPI_ADMIN_BIND opt-in |

## M1 OpenAI 面（当前实现）

| 端点 | CLI 映射 | 语义 |
|---|---|---|
| GET /v1/models | model list ×4 类型 | {object:list,data:[{id,object,owned_by:jimeng,kind}]} |
| POST /v1/images/generations | generate-image --wait imageWaitSeconds(150) | 同步；{model,prompt,size(WxH→最近 ratio),n(1-4)}→{created,data:[{url 签名}]}；response_format 仅 url；超时 504+error.param=jobId（轮询 /v1/jobs/{id}，勿重提） |
| POST /v1/videos | generate-video（不 wait） | 异步；{model,prompt,seconds(1-15),size}→{id,object:video,status:queued,...}；**接受 JSON 与 SDK 式 multipart 纯字段**（OpenAI 真实端点为 multipart）；文件部分 400（input_reference 留 M2+） |
| GET /v1/videos/{id} | query-result --out（单次） | {id,status:queued\|in_progress\|completed\|failed,error} |
| GET /v1/videos/{id}/content | 产物首文件 | completed 否则 409；video/mp4 流 |
| GET /v1/jobs/{id} | 任务表 | 通用扩展：{id,kind,status,credits,outputs urls,error} |
| GET /files/{jobId}/{name}?exp&sig | HMAC 签名 | 免 key（签名即凭证）；过期/篡改/穿越 403 |

错误映射：CLI AUTH/CREDENTIAL/LOGIN → 502 upstream_authentication_required（hint login）；
INVALID_ARGUMENT → 400；其余 → 502 upstream_error（含 logId）。
限额：per-key 分钟限流 + 生成类全局并发闸（429）；body 上限 413；坏 JSON 400；
积分帽 UTC 日界累计 deducted，达上限新提交 429 credit_cap_exceeded（查询不受限）。
响应头：JSON `Cache-Control: no-store` + nosniff；签名文件 nosniff + private max-age=3600；
访问日志脱敏（method/path/status/ms，不含 key/签名/query）。
任务表：state/jobs.jsonl append-only + 启动重建（last-wins），崩溃安全。

## M2 DashScope 面 + 音频/剧本 + admin（当前实现）

| 端点 | 语义 |
|---|---|
| POST /api/v1/services/aigc/text2image/image-synthesis | 须 `X-DashScope-Async: enable`（缺 400）；{model,input:{prompt},parameters:{size}}→{output:{task_id,task_status}}；图像同步完成即 SUCCEEDED |
| POST /api/v1/services/aigc/video-generation/video-synthesis | 同上；parameters:{duration,size}；PENDING/RUNNING→查询 SUCCEEDED |
| GET /api/v1/tasks/{task_id} | {output:{task_status,results:[{url 签名}]},usage:{credits}}；共享 OpenAI 面任务表 |
| POST /v1/audio/speech | OpenAI 形状 {model:qwen_tts,input,voice(接受但忽略，无音色控制)}→音频字节流（wav）；超时 504+jobId |
| POST /v1/audio/generations | 扩展：seed_audio 音乐/音效 {prompt,sample_rate?}→{created,data:[{url}]} |
| POST /v1/script/outline | {episode_num(1-100),idea,ref_content?,model_key?}→{id,kind,status,outputs urls}；隐藏绑定目录 state/script 自动 init |
| POST /v1/script/episode | {characters,current_episode,current_episode_summary,history_summary?,future_summary?,model_key?} |
| admin POST /admin/login | 非交互授权挑战（loopback/LAN only） |
| admin POST /admin/login/wait | {deviceCode,timeout?}→登录交换 |
| admin POST /admin/cli/refresh | 显式刷新 CLI 缓存（JMAPI_CLI_REFRESH 语义） |
| admin POST /admin/config/reload | 热重载 config.toml（同 SIGHUP） |

DashScope 错误形状 {code,message,request_id}；限流/积分帽同 OpenAI 面（429）。
script 轮询走 GET /v1/jobs/{id}（kind=script，script result --out 落盘）。
**落盘语义**：out 目录预建；script --out 为单 md 文件路径；落盘失败≠生成失败
（in_progress+error.retryable，勿重提）；completed 结算清除 error。

## 错误信封

OpenAI 面：`{"error":{"message","type","code","param"}}`；DashScope 面：
`{"code","message","request_id"}`。翻译保留 CLI 的 logId/上游错误码/hint（脱敏凭据）。
running≠失败：超时返回 running 语义，客户端轮询，服务端不自动重提。

## 产物 URL

`/files/{taskId}/{name}?sig=&exp=` HMAC 短期签名（默认 1h，config 可配）；
浏览器/img 标签可直取；过期 403。

## 限额

per-key 限流 + 全局并发闸（429）；请求体上限（默认 10MB）；积分帽默认 500/天
（UTC 日界，仅拦新提交，查询不受限；0=关闭须启动警告）。