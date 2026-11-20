---
date: 2026-11-19T19:00+08:00
keywords: [bind-mount, demotion, uid-map, godoword, agpl-firewall, acceptance]
scope: [project]
type: decision
status: accepted
supersedes: []
superseded_by: []
pr: ""
---

# 存储三分、自适应降权与 godoword 约定借鉴（许可防火墙）

## 背景

config 需 operator 手改 → 命名卷反人类、bind 友好；rootless bind 所有权坑（:U 污染宿主属主、
keep-id 需 flag 且 uid 受限）。观摩同机 hinnyuu/godoword（AGPL-3.0，只读）：其进程内自适应降权
（stat 属主 + uid_map → setgroups/setgid/setuid）更彻底；另有四类文档分离、status live 交接、
history frontmatter+INDEX 派生、docs-gate 漏改/链接/CJK/禁入/新鲜度门禁、验收拆分
（自动化冒烟+人工残留三件套）、squash same-tree+main 重冒烟、gitleaks 钉版+checksum、
quadlet 双栈两条 PublishPort、可靠性测试锚定等制度化实践。

## 决策

存储三分：/config ro bind、/state rw bind、/output rw bind；**采纳进程内自适应降权取代 keep-id**
（无 flag、宿主 uid 任意、bind 文件永归宿主用户；rootful+root 属主 chown 1000 再降；PUID/PGID 覆盖；
SELinux :Z 容器内修不了→EACCES 明确提示）。借鉴 godoword 全套约定并按小项目裁剪
（glossary 门禁初版不做、impact-map 简化、无前端/双后端 SQL）；任务表用 append-only JSONL
ledger+启动重建索引（零 DB 依赖）。**许可防火墙：godoword AGPL → 只借鉴行为规格，严禁复制代码，
clean-room 重写**（gate/smoke 交子 agent 独立实现）。本地 smoke 用现成 dev（比 godoword 本地建
临时用户更严：本机零系统改动）。healthz/readyz 分离、幂等 entrypoint、优雅退出、8080 一并采纳。

## 后果

旋转 agent 交接基础设施齐备；merge=冒烟绿+人工残留 sign-off 使人工 approve 有清单可依。
见 [conventions](../docs/project/conventions.md)、[gates](../docs/project/gates.md)、NOTICE 借鉴声明。