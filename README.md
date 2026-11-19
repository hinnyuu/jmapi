# jmapi

即梦短剧 CLI 的 API 包装器：把官方 `jimeng-novel` CLI 原封不动地包装为
OpenAI 兼容与 DashScope 兼容的双一等公民 HTTP API，供局域网/个人公网反代调用。

- 许可证：MIT（仅覆盖本仓库包装器源码，见 [NOTICE](NOTICE)）
- 容器：podman 优先（rootless 一等公民），兼容 docker
- 镜像零专有字节：即梦组件由操作者在容器启动时从官方源自行获取

文档与开发纪律见 [AGENTS.md](AGENTS.md)。