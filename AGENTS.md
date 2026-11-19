# AGENTS.md — agent 入口指南

> 无上下文 agent 的切入口。本文件是**地图与接续协议**，不复述其他文档（保持短小，省上下文）。
> 稳定指南（极少变）；**live 工作状态见 [docs/project/status.md](docs/project/status.md)**。

## 这是什么项目

jmapi：把即梦短剧 CLI（`jimeng-novel`）**原封不动**包装为 OpenAI 兼容 + DashScope 兼容
双一等公民 HTTP API 的服务。MIT；单容器；podman 优先（rootless 一等公民）、兼容 docker。
镜像零专有字节：即梦组件由操作者启动时从官方源自行获取（cache-first）。
**单人开发者 + 旋转 agent 长期维护**——每个里程碑可能耗尽一个 agent 上下文，由新 agent 接续。

## 阅读顺序（建立心智模型）

1. [docs/project/status.md](docs/project/status.md) — 我们在哪、下一步、待拍板决策（**先读这个**）
2. [docs/project/roadmap.md](docs/project/roadmap.md) — 里程碑与要去哪
3. [docs/project/architecture.md](docs/project/architecture.md) + [docs/api.md](docs/api.md) — 组件与 API 契约
4. [docs/project/conventions.md](docs/project/conventions.md) + [gates.md](docs/project/gates.md) — 怎么干活（铁律）
5. [history/INDEX.md](history/INDEX.md) — 近期决策（**已定的不要重议**）
6. `devenv.md`（仓库根，gitignored）— 本机环境事实。**新机器 clone 后此文件不存在**：
   探测本机环境（硬件/OS/安全模块/容器运行时/工具链/网络可达性/资源约束/用户与 uid 映射）并创建它；
   已存在则会话开始读取、任务相关事实抽查、环境变化时维护、核验后更新 verified 时间戳。
   **严禁写入密钥值（只记路径），严禁提交（含 git add -f）。**

## 接续协议（新 agent 必做）

- 读 status.md 的「待拍板决策」——这些需用户输入，**别自作主张**。
- 查 `git log` + 开放 PR（`gh pr list --state open`；gh 不可用时查 REST/公开页；
  都不可用须显式写"开放 PR 未核验"，不得默认为零）。
- 查 history INDEX 近期条目——已定决策不重新讨论。**但缺陷≠重议**：审计/测试发现的
  正确性、安全、授权缺陷必须登记并修复，不以"已定案"为由回避。
- status 可能滞后：用 git log / PR / history **交叉验证**。冲突裁决：git log/合并 PR 定主线；
  源码 + 可复现测试定实现事实；status 负责 live 交接；history 只解释为什么。
  冲突未解时标 blocked，**不自行挑选最有利的一份文档**。

## 呼叫人工的触发器（自主边界）

以下情形停下呼叫用户，其余 plan→implement→test→self-review→PR 自主循环：
花账号积分的 live 生成；接触/搬运真实凭据；系统级改动（建用户/改 sysctl/装系统包/升级运行时）；
规格歧义或文档冲突未解；安全决策；同一失败重试 ≥3 次；merge 与分支保护变更（人工 approve）。

## 工作纪律

- **保持 status.md 当前**：每完成有意义步骤更新 done/in-flight/下一动作；收工前确认反映现实。
  上下文可能突然耗尽，持续维护比临终遗言健壮。
- 改 `src/`、`test/`、`Containerfile`、`deploy/`、`scripts/`、`.github/workflows/` 须同 PR
  更新命中的 docs/wiki（impact-map 漏改门禁）+ status.md；行为/接口/决策变更写 history 条目。
- 提交前跑 `python3 scripts/docs-gate/gate.py --local` 预检；门禁逻辑改动须过 `test_gate.py`。
- **重构建一律走 CI**；本机 2H2G：重任务串行（同时最多一个）、npm 依赖精简、gh/git 网络失败先重试。
- **本机零系统改动**：rootless 测试用现成 dev 用户；临时用户/系统包只允许在 CI ephemeral runner。
- **清理纪律**：/tmp 暂存、测试容器/卷/镜像每次用完即清（前缀隔离，只清自有资源）；
  `scripts/clean-test.sh` 兜底；绝不碰无关镜像与容器。
- **可靠性须测试锚定**：凡声称 fail-closed/原子/幂等/硬边界（积分帽、cache-first、降权、key 校验），
  须有失败路径 + 并发负例测试，不能只测 happy path。
- **许可防火墙**：hinnyuu/godoword 为 AGPL-3.0——只借鉴约定与行为规格，**严禁复制其代码**；
  本仓库一切脚本 clean-room 实现。即梦专有产物永不入仓库/镜像层（见 NOTICE）。
- conventional commits：type/scope 英文、subject 中文；squash merge；agent 不自合、不 force-push。

## 文档体系

| 类别 | 受众 | 职责 | 入仓库 |
|---|---|---|---|
| docs | agent | 当前代码事实 + roadmap 差异 | 是 |
| wiki | 人类 | 用户/协作者向解释 | 是 |
| history | agent/人类 | 为什么变（不可变） | 是 |
| status | agent | live 交接状态 | 是 |
| devenv | 本机 agent | 环境本地事实 | 否（gitignored） |