---
date: 2026-11-20T14:45+08:00
keywords: [item2-pass, borrowing-discipline, item3, admin-coordination, nip-io, wan-probe]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# 项 2 复跑 PASS 记录、借鉴纪律升格、项 3 管理员协同协议

## 背景

用户报告项 2 以 998bd642 镜像复跑**完全成功**（v4/v6/readyz/admin/重启缓存命中）并已清理。
用户裁定"借鉴须读全后果段前提"升格铁律。项 3 进入协同：用户为 trailblazer 本机管理员，
询问需提供何种帮助；agent 无 trailblazer 访问权，但开发机相对 trailblazer 即外网视角。

## 决策

conventions 新增「借鉴纪律」节：读全后果段与前提、核对当前宿主、实测 grounding 后才入产物。
runbook 项 3 重写为分工协议：管理员负责 jmapi 起服务/防火墙仅 80/443/Caddy 安装与站点加载
（每步回复输出）；**agent 从开发机执行全部 WAN 通过标准探测并判读**（免管理员找外网设备）；
域名免 DNS 方案 `<公网IP>.nip.io` 泛解析 + Caddy ACME 自动签证；Caddy 三路径（系统包/临时前台/
rootful host 网络容器）；清理后 agent 复探确认关闭。sign-off 记录双方时间戳。

## 后果

项 3 不再依赖管理员自备外网设备与 DNS 操作；agent 判读闭环。项 1/2 实测 PASS 已记录，
sign-off 与 approve 待用户。见 [runbook](../wiki/deploy/acceptance-runbook.md) 项 3、
[conventions](../docs/project/conventions.md#借鉴纪律)。