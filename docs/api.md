# API 契约（当前事实）

> 双一等公民：OpenAI 兼容面与 DashScope 兼容面共享同一任务表与 CLI 执行层。
> 认证：`Authorization: Bearer <JMAPI_API_KEY>`；缺失/错误 → 401 标准错误信封。
> 就绪前业务端点 503；M0 未实现端点有 key 时 501。

## M0（当前）

| 端点 | 行为 |
|---|---|
| GET /healthz | 恒 200 `{"status":"ok"}` |
| GET /readyz | CLI fetch/复验就绪 200，否则 503 `{"status":"fetching"\|"error"}` |
| /v1/*、/api/* | 无 key 401；有 key 未就绪 503；就绪但未实现 501 |
| admin :8081（容器 loopback，不 publish） | 宿主经 `podman exec jmapi curl -s http://127.0.0.1:8081/admin/status` 访问；M2 落地 login/refresh/reload；LAN 直连须显式 JMAPI_ADMIN_BIND opt-in |

## M1 OpenAI 面（计划形状，落地时更新本文件）

| 端点 | CLI 映射 | 语义 |
|---|---|---|
| GET /v1/models | model list | 模型发现，key 直曝 |
| POST /v1/images/generations | generate-image --wait | 同步；{model,prompt,size,n}→{created,data:[{url}]}；size→ratio/resolution 翻译 |
| POST /v1/videos | generate-video（不 wait） | 异步；返回 {id,status:queued}；seconds→duration |
| GET /v1/videos/{id} | query-result（单次） | {id,status:in_progress\|completed\|failed} |
| GET /v1/videos/{id}/content | 产物文件 | 签名 URL 或验 key 直服 |
| POST /v1/audio/speech | generate-audio qwen_tts | {model,input}→音频字节；无 voice 参数（文档写明） |

## M2 DashScope 面 + 扩展（计划形状）

| 端点 | 语义 |
|---|---|
| POST /api/v1/services/aigc/text2image/image-synthesis | Header `X-DashScope-Async: enable` → {output:{task_id,task_status}} |
| POST /api/v1/services/aigc/video-generation/video-synthesis | 同上，共享任务表 |
| GET /api/v1/tasks/{task_id} | {output:{task_status,SUCCEEDED\|FAILED\|RUNNING,results}} |
| POST /v1/audio/generations（扩展） | seed_audio 音乐/音效 |
| POST /v1/script/outline、/v1/script/episode | 结构化剧本（封闭 schema：episode_num/idea/characters…），异步任务 |

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