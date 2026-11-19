---
date: 2026-11-19T17:40+08:00
keywords: [live-test, latency, concurrency, idempotency, fixtures]
scope: [project]
type: decision
status: accepted
supersedes: []
superseded_by: []
pr: ""
---

# 全类型实测锚点（图/视频/音频/文本/并发/幂等）

## 背景

设计假设需实测证实。真实账号（积分充足）完成：无头 device-code 登录（token 6h 自动续期）；
seedream_5.0_flash 生图 38s/40s 各 3 积分；Seedance_2.0_mini 480p 4s 视频提交 6s 返回
thread_id/run_id、约 105s 完成 20 积分；qwen_tts 31s/5 积分 WAV；seed_audio 26s/3 积分 MP3；
script outline（doubao_seed_2.0_lite 非默认模型切换生效）48s/4 积分结构化大纲。
视频运行中并行生图互不干扰；query-result 未完成返回 running+exit 0；
错误信封带合法参数提示；script 支持 --request-id 幂等键（generate-* 无）。

## 决策

以上时延/积分/语义作为设计锚点与契约 fixture 素材（脱敏后入仓）：
独立一次性生成可并发（无需全局串行锁）；login/logout 与同节点修改串行；
running≠失败、不自动重提；script 需目录绑定画布（门面内部维护隐藏绑定）；
重试安全靠任务表防重（generate-* 无幂等键）。共耗 38 积分。

## 后果

CI 永不 live（不花积分）；契约测试用脱敏录制信封驱动假 CLI。
fixture 与负例测试锚定可靠性声称。见 [conventions](../docs/project/conventions.md)。