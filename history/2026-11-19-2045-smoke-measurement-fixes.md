---
date: 2026-11-19T20:45+08:00
keywords: [smoke, race, proc-status, exec, diagnostics, version]
scope: [project]
type: change
status: accepted
supersedes: []
superseded_by: []
pr: "1"
---

# smoke 三处测量缺陷修正与 T6 诊断补强

## 背景

四轮 CI smoke 17 PASS/5 FAIL。逐条定位：①T1 healthz 在 run -d 后单次 curl，
node 尚未监听 → 000 假红（测试竞态）；②uid 断言用 `podman exec id -u`——exec 是
新进程、用容器默认用户，永远测不到 entrypoint 降权结果（T5 假红）；③fetch meta
version 正则误配裸 bundle 名 → "unknown"。T6 临时用户矩阵失败但日志被沉默且
cleanup 只 dump runner 侧（T6 容器在临时用户存储里）→ 无现场。

## 决策

healthz 改 wait_http 轮询（≤15s）；uid 断言改读 `/proc/1/status` 的 Uid 行；
version 改配 inner.name；T6 pull 去沉默、check_ready 失败即 dump alt 侧 ps/logs；
cleanup 失败 dump 覆盖临时用户侧容器。gates.md 同步测量语义。

## 后果

测量不再制造假红；T6 若仍红下一轮必留现场。缺陷≠重议：矩阵与降权选型不变。
见 [gates](../docs/project/gates.md)。