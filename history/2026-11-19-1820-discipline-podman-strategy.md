---
date: 2026-11-19T18:20+08:00
keywords: [podman, rootless, selinux, ci, gates, conventional-commits]
scope: [project]
type: decision
status: accepted
supersedes: []
superseded_by: []
pr: ""
---

# 开发纪律与 podman rootless/SELinux 策略

## 背景

用户要求：conventional commits、agent 自主开发测试为主/分歧呼叫人工、CI 门禁
（合并前代码审计防凭据入库）、podman 一等公民（本机可测）、/tmp 与测试镜像容器每次清理、
纪律入仓为铁律。本机实测：root 会话、KVM、podman 4.3.1（无 Quadlet）、SELinux 未安装、
dev 用户 uid1000 具备 subuid/subgid 与 linger（rootless 零系统改动就绪）、
dev 默认存储历史固化 vfs（显式 overlay 在全新存储可用）、2H2G/19G 磁盘、
docker.io 不可达（uhub 内网镜像库）、deb.debian.org 可达。

## 决策

rootless 拆两层：CI rootless 门禁 + 镜像内自适应降权；本机用现成 dev（零系统改动），
非 1000 uid 矩阵仅 CI 临时用户。runuser 三坑固化进脚本（XDG_RUNTIME_DIR=/run/user/1000、
cd 可访问目录、cgroupfs 回退警告无害）。SELinux 本机/CI 均复现不了 → 构造即正确
（bind 默认 :Z/:z、凭据卷私有禁共享）+ 文档矩阵兜底并诚实声明覆盖边界。
Quadlet 双轨（run.sh 全兼容 + quadlet≥4.4）。铁律增补：凭据零容忍三层、CI 永不 live、
供应链钉版校验、fail-closed 启动、清理可执行化（trap+前缀隔离+clean-test）、
commitlint 机械化、agent 呼叫人工触发器、merge 人工 approve、podman-first 产物命名、
可复现构建、文档同 PR 门禁。devenv.md 铁律：接手检查→不存在探测撰写→变化维护→永不入库。

## 后果

2H2G 推出"重构建归 CI、本机重任务串行"。uhub 镜像清单仅 node:22-slim
（命名 uhub.service.ucloud.cn/hinnyuu/node:22-slim，主开发者添加）。
见 [gates](../docs/project/gates.md)、[conventions](../docs/project/conventions.md)。