# jmapi 用户指南

jmapi 把你自己的即梦账号能力包装成标准 HTTP API：局域网内（或经 Caddy 反代个人公网）
用 OpenAI SDK / DashScope 风格调用即梦的生图、生视频、语音与剧本能力。

- **它不是即梦官方产品**：独立包装器，MIT 许可；即梦组件由你的容器启动时从官方源自行获取。
- **花的是你账号的积分**：API key 泄漏=积分被烧；公网暴露前读 [部署指南](../deploy/quickstart.md)
  与仓库 SECURITY.md。
- 快速开始与端点示例见 [api.md](api.md)；部署见 [quickstart](../deploy/quickstart.md)。

## 你需要准备

1. 一个即梦账号（浏览器授权登录一次，凭据留在挂载卷）。
2. podman（推荐 rootless）或 docker；主机可访问即梦官方 CDN（或离线安装包）。
3. 自生成的强 API key（`openssl rand -hex 32`）。