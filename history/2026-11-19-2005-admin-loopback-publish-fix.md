---
date: 2026-11-19T20:05+08:00
keywords: [admin, loopback, publish, port, defect]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# admin 面可达性缺陷修正：容器 loopback 不 publish

## 背景

M0 自查发现契约缺陷：admin 默认绑 127.0.0.1 是**容器内** loopback，而 run.sh/quadlet/
quickstart 却 publish `127.0.0.1:8081:8081`——宿主端口转发到容器 eth0，到不了容器
loopback，publish 是死端口。smoke 未覆盖 admin 故 CI 不会抓住。

## 决策

保留最强默认：admin 只绑容器 loopback 且**不 publish**；宿主访问改 `podman exec jmapi
curl -s http://127.0.0.1:8081/admin/status`；删除三处死 publish；LAN 直连为显式 opt-in
（JMAPI_ADMIN_BIND=0.0.0.0 + 自限来源，文档警告）。补业务面 /admin/* → 404 负例测试
锚定两面分离。docs/api、architecture、SECURITY、quickstart 同步当前事实。

## 后果

admin 攻击面默认止于容器内；M2 login 管理流沿用 exec 路径。缺陷≠重议：本条为修复登记，
不改变"admin 不出公网"既定决策。见 [SECURITY](../SECURITY.md)。