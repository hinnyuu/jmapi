# 开发规范（铁律）

> 本规范是 agent 与主开发者的强制约定。门禁机制见 [gates.md](gates.md)。

## 语言规则

- 文档、wiki、历史的**所有解释型文字用中文**。例外：英文文件名、变量名、代码标识符，
  以及计算机专业常用英文词（token、socket、api、commit、rootless 等）。
- commit message：type/scope 用英文（机器解析部分），subject 用中文。
  例：`feat(api): 新增视频异步任务端点`。

## 文档体系（四类，严格分离）

| 类别 | 读者 | 职责 | 位置 |
|---|---|---|---|
| docs | agent / 主开发者 | 当前提交代码事实 + 与 roadmap 的差异/待办 | `docs/`、`docs/project/` |
| wiki | 人类（用户/协作者） | 充足解释，人类逻辑 | `wiki/{user,deploy,contributors}` |
| history | agent / 人类 | 为什么变（决策/变更/事故/退役），不复述当前事实 | `history/` |
| devenv | 本机 agent | 环境本地操作上下文 | 仓库根 `devenv.md`，**严禁提交** |

铁律：
- docs/wiki **只记当前事实**，严禁堆积历史变更（防膨胀与注意力稀释）。
- history 只记"为什么变"，当前事实永远只在 docs。
- 项目文档可引用 devenv.md，但绝不依赖其内容承载项目事实；验收 runbook 写环境无关通用命令。

## 历史格式

每条一个 markdown 文件，文件名 `YYYY-MM-DD-HHMM-<slug>.md`（避免冒号）。frontmatter：

```yaml
date: 2026-11-19T16:50+08:00   # 决策达成时刻，精确到分钟，显式时区
keywords: [api, openai, dashscope]
scope: [project]               # 模块 id 或 project
type: decision                 # decision | change | incident | retirement
status: accepted               # accepted | superseded
supersedes: []
superseded_by: []
pr: ""
```

正文三段：背景 / 决策 / 后果，简短，链接到当前 docs。
**正文不可变**（append-only）；唯一例外：被取代时更新 status/superseded_by。
CI 从 frontmatter 生成 `history/INDEX.md` + `INDEX.json`（派生物，勿手改）。

## 提交与验收流程

- 严格 conventional commits；squash merge，PR 标题 conventional。
- 分支开发 → PR → CI 全绿（docs-gate + commitlint + gitleaks + node 检查 + 镜像构建 + 容器冒烟）
  → 推送 `ghcr.io/hinnyuu/jmapi:pr-N`/`sha-xxxx` → CI 自动冒烟 → **人工对残留清单 sign-off**
  → squash merge 进 main → main 构建 `:latest`，release 打 semver。
- main 分支保护：必须 PR + 检查全绿 + 人工 approve。**agent 不自合、不 force-push。**

### 验收拆分：自动化冒烟 + 人工残留

判据：**确定性 CLI 反馈 + agent 有访问权 + 可客观断言 → 自动化冒烟**；
**需人类感官/判断或 agent 缺访问权（SELinux enforcing 宿主、quadlet≥4.4 宿主、公网 Caddy 实测）→ 人工**。

- 自动化冒烟：`scripts/acceptance/smoke.sh`，CI 镜像构建后以 podman rootless 自动执行；
  资源唯一前缀隔离 + 专用端口段，`trap EXIT` 自动清理，**只清自有资源，绝不碰用户容器/镜像**。
- 人工残留清单纪律：PR 残留清单**逐项**须为完整 runbook（见下节），覆盖全部残留项
  （如 SELinux 须含 `:Z` 正例 + 不带 `:Z` 负例），每项命令与清理一一对应。
- merge 前置 = 自动化冒烟绿 + 人工对残留 sign-off。
- 验收与合并须为**同一 tree 内容**（squash 保持 tree 不变）；merge 后 CI 对 main 镜像重跑冒烟。

### 人工残留 runbook 纪律

散文式"通过标准"不合格。每项残留验收须含四段，**全部 fenced 代码块、可整段复制执行**：

1. **前置**：宿主/权限/网络/端口前提 + **具体镜像 tag / REF 字面量**（禁笼统 pr-N、禁变量间接；
   测试机零假设：产物经 curl raw 投递，不假设 repo/开发工具在手；产物变更须同批更新 REF 字面量）。
2. **执行命令**：完整可复制命令块（含建目录/写配置/装单元等准备动作）。
3. **通过标准**：**具体验证命令 + 期望输出**（注释标明期望值），含负例；禁止只写散文。
   - **证据通道 = 服务自身日志（podman logs）终态标记**（如 fetch error/fetch done/cache hit），
     禁止中间态（fetching/running）作拒绝证据；AVC/readyz 等侧通道不作主证据。
   - **等待窗口从代码推导**：定位首个失败操作的位置与时序（如 mkdir 先于下载 → 拒绝秒级出现），
     加启动竞态余量；不拍脑袋给上限。
   - **负例隔离**：负例用独立 fresh 目录/卷，绝不复用正例资源（`:Z` 私有 MCS 类别污染会产生
     迷惑中间态——实测教训）。
   - **不可判定记 SKIP+证据命令输出**（如 label 关闭宿主），禁硬期望、禁记 PASS。
4. **清理命令**：与执行一一对应，只清自有资源。

**grounding 规则**：期望输出须有实测来源——agent 自测执行，或人工执行报告（含其他项目同宿主
历史实测）。无 grounding 的预测标"待实测"，**不得作为 sign-off 依据**；首轮人工执行结果回写
runbook 后才生效。可自动化部分（如 Caddy 路由策略/TLS 终止）进 smoke（T8），人工残留收窄到
真正需要宿主/管理员的部分（WAN 暴露面），并以"管理员精确命令+期望+清理、agent 判读"协同。

常设 runbook 入仓 [wiki/deploy/acceptance-runbook.md](../../wiki/deploy/acceptance-runbook.md)；
**PR 残留章节须与其同源同批更新**（完整嵌入，不得只留链接）。sign-off 以 PR 评论逐项记录
（PASS/FAIL/SKIP + 日期 + 宿主描述 + 偏差）；FAIL 阻断 merge，SKIP 须人工确认接受风险。

## 安全与凭据铁律

- **私有凭据永不入库**：gitleaks（pre-commit 建议 + CI 全历史）+ 禁入路径门禁 +
  GitHub secret scanning/push protection（public 仓库）三层。fixture 必须脱敏（假 id）。
- 日志一律脱敏 Authorization/token/cookie；devenv 只记凭据路径不记值。
- live 凭据只存在于挂载卷（state）；CI 永不登录真实账号、永不生成（不花积分）；
  live 测试仅本机 `JMAPI_LIVE=1` opt-in。
- 启动 fail-closed：无 `JMAPI_API_KEY` 或无 `JMAPI_CLI_SOURCE`（及离线替代）拒绝启动。
- 公网暴露默认值：强 key、admin 面只绑 loopback/LAN、限流+并发闸、积分帽默认 500/天
  （config/env 可改，0=关闭须启动警告）、产物 URL HMAC 签名短期有效、TLS 只在 Caddy 边缘。
- 凭据卷私有：bind 一律 `:Z`，禁止多容器共享凭据目录。

## 容器与存储铁律

- podman 一等公民：`Containerfile`、CI smoke 用 podman rootless；workflow 内构建允许 docker/buildx。
- 镜像零专有字节、默认零 ffmpeg（`WITH_FFMPEG=1` 变体自担 GPL 合规，见 NOTICE）。
- 存储三分：`/config` ro bind、`/state` rw bind、`/output` rw bind；rootless 所有权由
  **进程内自适应降权**解决（stat 属主 + uid_map → setgroups/setgid/setuid；PUID/PGID 可覆盖；
  rootful+root 属主 → chown 1000 再降权）；不依赖 keep-id flag、不用 `:U` 污染宿主属主。
- CLI cache-first：缓存复验命中则零网络零下载；升级显式（refresh）；离线走 bind 安装包。
- SELinux 构造即正确：bind 默认 `:Z`/`:z` 显式标签；enforcing 宿主不在 CI 矩阵，文档兜底并诚实声明。

## 开发环境铁律

- 重构建一律走 CI；本机重任务串行、防 OOM；npm 依赖精简（实测 npmjs 慢）。
- 本机零系统改动：rootless 用现成 dev；临时用户/系统包仅 CI。
- GitHub 网络间歇：gh/git push 失败先重试再排查。
- 清理纪律：/tmp 暂存与测试容器/卷/镜像每次用完即清；`scripts/clean-test.sh` 兜底。
- devenv.md 维护协议见根 [AGENTS.md](../../AGENTS.md)；不存在则探测撰写，存在则读取+抽查+维护。

## 许可防火墙

hinnyuu/godoword 为 AGPL-3.0：只借鉴约定与行为规格，**严禁复制其任何代码**；
本仓库脚本 clean-room 独立实现。即梦专有产物不入仓库/镜像层（NOTICE）。

## 可靠性须测试锚定

凡声称 fail-closed/原子/幂等/硬边界，须有失败路径 + 并发负例测试锚定，不能只测 happy path。
加固叙事入 history，live 文档只记当前事实。

## agent 提交前自查

见 [gates.md](gates.md) 自查清单：漏改？history？链接？密钥/禁入？commit 合规？残留清单三件套？