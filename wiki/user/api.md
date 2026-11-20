# API 使用示例（人类向）

> 端点当前事实见仓库 [docs/api.md](../../docs/api.md)；本页给可复制示例。
> M0 阶段仅 healthz/readyz 与认证门禁；生成端点 M1/M2 落地后本页同步更新。

## OpenAI SDK（M1 起）

```python
from openai import OpenAI
client = OpenAI(base_url="http://<lan-host>:8080/v1", api_key="<你的 key>")

img = client.images.generate(model="seedream_5.0_flash",
                             prompt="一只橘猫坐在窗台上，窗外雨后黄昏",
                             size="1792x1024")   # size 翻译为 ratio/resolution
print(img.data[0].url)                          # 签名 URL，短期有效

vid = client.videos.create(model="Seedance_2.0_mini",
                           prompt="镜头缓慢推进，橘猫转头", seconds=4, size="854x480")
# 轮询 client.videos.retrieve(vid.id) 至 completed，再取 content
```

## DashScope 风格（M2 起）

```bash
curl -s http://<lan-host>:8080/api/v1/services/aigc/video-generation/video-synthesis \
  -H "Authorization: Bearer <你的 key>" -H "X-DashScope-Async: enable" \
  -H "Content-Type: application/json" \
  -d '{"model":"Seedance_2.0_mini","input":{"prompt":"橘猫转头"},"parameters":{"duration":4,"resolution":"480p"}}'
# → {"output":{"task_id":"...","task_status":"PENDING"}}
curl -s http://<lan-host>:8080/api/v1/tasks/<task_id> -H "Authorization: Bearer <你的 key>"
```

## 健康与就绪（M0 起）

```bash
curl -s http://<lan-host>:8080/healthz   # {"status":"ok"}
curl -s http://<lan-host>:8080/readyz    # 首启 fetch 期间 503，就绪后 200
# admin 只绑容器 loopback：宿主经 exec 访问，含实际 CLI 版本号与登录态
podman exec jmapi curl -s http://127.0.0.1:8081/admin/status
```

## 注意

- 服务默认双栈监听：IPv4 与 IPv6（含反代两族）皆可达；`JMAPI_BIND` 可覆盖。
- 模型名直曝即梦 model key（`model list` 可查）；积分帽默认 500/天，超限新提交被拒。
- 视频为异步：running 不是失败，轮询即可，不要重复提交。
- 音频 speech 端点无 voice/音色参数（qwen_tts 能力边界）。