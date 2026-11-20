---
date: 2026-11-20T13:14+08:00
keywords: [fetch, async, event-loop, sigterm, t8, caddy, rootless, slirp4netns, aardvark]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# fetch 异步化缺陷修复与 T8 自测落地（宿主 quirks 链）

## 背景

T8 落地过程实测抓出服务真缺陷：fetch 用 execFileSync/spawnSync **阻塞事件循环**——
下载期间 healthz/readyz 全死、SIGTERM 无效被 SIGKILL（诊断容器实证）。
另抓 smoke/宿主 quirks 链：①T8 prepare_bind 误用 $(id -u)（root→0→rootless 溢出 fatal；
T1 有 root+dev→1000 分支）；②port-only site（:8443）无 automation policy，internal CA
不发证 → TLS internal error alert，须假域名 site + curl --resolve 供 SNI；
③rootless podman 4.3 **不支持运行中容器 network connect**（slirp4netns invalid network mode，
此前 connect 全静默失败）→ 启动即 --network；④本机 aardvark-dns 二进制在但 rootless
跨容器 DNS 不接管 resolv.conf → 上游用 inspect 容器 IP 而非别名。

## 决策

fetch.mjs 全异步子进程（run promise + await curl/installer）；响应性负例锚定入
fetch.test（慢安装器期间定时器须触发，旧同步实现必红）。T8：启动挂自定义网络、
IP 上游、假域名 site+tls internal+--resolve、四断言（healthz 200/admin 404/401/501）；
本机 uhub caddy 镜像、CI 钉版 caddy:2-alpine + digest 比对入 versions.lock。
本机 smoke 19/19 全绿 grounding。devenv 记 quirks③④。

## 后果

fetch 期间服务可响应、可优雅退出；T8 把 Caddy 安全路由纳入自动门禁；
WAN 侧留人工 runbook 项 3。见 [architecture](../docs/project/architecture.md)、smoke.sh T8。