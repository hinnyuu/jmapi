---
date: 2026-11-20T17:10+08:00
keywords: [credentials, home, state-bind, restart, multipart, sdk, live-test]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "2"
---

# live 实测两缺陷：SDK multipart 形态与凭据 HOME 落点

## 背景

用户批准 live SDK 实测（<30 积分）。首轮 images.generate 成功（3 积分、签名 URL 取回 PNG），
videos.create 400 invalid_json：抓包证实 **openai SDK videos.create 发 multipart/form-data**
（OpenAI 真实 /v1/videos 端点形态，供 input_reference 上传）。修复后重跑又抓第二缺陷：
容器重启后登录态丢失——CLI 凭据落 $HOME/.local/share/…，而 podman exec 默认 HOME=/root
（容器临时层），M0"凭据落 state"假设从未落实。

## 决策

readBody 双解析：JSON + multipart 纯字段（boundary 解析、文件部分 400 unsupported_parameter，
input_reference 留 M2+）；契约正负例（FormData 200 / 带文件 400）。
entrypoint 统一 process.env.HOME=/state/home（mkdir 持久化），execCli 增 home 覆盖选项+
home-probe 契约锚定；podman exec login 须显式 -e HOME=/state/home（quickstart 同步警告）。
architecture 存储表 state/home 明确。

## 后果

SDK 全形态兼容；登录态跨重启持久。live 重跑待新镜像+重新授权（用户再次浏览器确认）。
教训：第三方 SDK 线格式须抓包验证而非假设 JSON；"凭据落卷"须验证实际写路径。
见 [api](../docs/api.md)、[quickstart](../wiki/deploy/quickstart.md)。