# 协作者指南

欢迎贡献。先读仓库根 [AGENTS.md](../../AGENTS.md) 与
[conventions](../../docs/project/conventions.md)、[gates](../../docs/project/gates.md)——
铁律对人与 agent 同等生效。

## 流程

1. clone 后若无 `devenv.md`：按 AGENTS.md 协议探测本机环境并创建（gitignored，严禁提交）。
2. 分支开发；conventional commits（type/scope 英文、subject 中文）。
3. 提交前：`python3 scripts/docs-gate/gate.py --local` + `bash scripts/test-local.sh`。
4. PR → CI 全绿 → 人工残留 sign-off → squash merge。不自合、不 force-push。
5. 改 src/test/Containerfile/deploy/scripts/workflows 须同 PR 更新命中 docs/wiki + status；
   行为/决策变更写 history 条目。

## 本地测试

- 单元+契约：`npm test`（node --test，零重型依赖）。
- 容器冒烟：`bash scripts/acceptance/smoke.sh ghcr.io/hinnyuu/jmapi:pr-<N>`
  （rootless 自动切换 dev；只清自有前缀资源）。
- 清理兜底：`bash scripts/clean-test.sh`。

## 许可注意

本仓库 MIT；**严禁从 AGPL 项目（如 hinnyuu/godoword）复制代码**——借鉴约定可以，
实现必须 clean-room。即梦专有产物永不入库（NOTICE）。