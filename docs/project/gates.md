# 门禁

> 关系图谱门禁防止文档漂移。机制见 [history](../../history/) 相关决策。
> 诚实局限：门禁防"漏改"，不防"语义写错"；语义一致性靠 agent 自查 + 人工验收。

## 关系图谱

项目级 [impact-map.yaml](impact-map.yaml)：glob → docs/wiki 清单 + status 要求。
CI 与本地预检聚合校验；新文件未登记 → 红（防图谱腐烂）。

## CI 检查清单

1. **commitlint**：PR 标题与 commits 符合 conventional（type/scope 英文，subject 中文，header≤100）。
2. **gitleaks**：钉版本下载（**保留原文件名**以供 checksums 行校验）+ **checksums 校验后才执行**；
   全历史扫描；豁免收窄为占位符与 CI 测试凭据 regex（见 .gitleaks.toml），保留 docs/wiki/history 扫描。
3. **docs-gate**：覆盖率（每个变更文件命中 impact-map 或豁免）、漏改（命中规则的 docs/wiki
   须同 PR 更新，`docs-nochange` 标签+评论豁免留痕）、链接+锚点、中文门禁、禁入路径
   （devenv.md/`*.key`/`*.pem`/`.env*`/`*token*.json`/secrets/）、status 新鲜度、
   history frontmatter 校验、INDEX freshness。**门禁逻辑回归 `test_gate.py` 必跑。**
4. **node**：eslint、`node --test`（单元+契约）、`npm audit --audit-level=high`、
   依赖许可证白名单脚本（MIT/Apache-2.0/BSD/ISC/PSF 等，其余个案审）。
5. **构建推送**：buildx 构建 `Containerfile`，推 `ghcr.io/hinnyuu/jmapi:pr-N` 与 `sha-xxxx`；
   基础镜像 digest 与 versions.lock 比对（lock 非空时），不符即红。
6. **容器冒烟**：`scripts/acceptance/smoke.sh`，podman rootless
   （ubuntu 24.04 须 `sysctl kernel.apparmor_restrict_unprivileged_userns=0`，仅 CI 临时环境）；
   覆盖 healthz/readyz、401/501、config ro、bind 属主、uid/卷矩阵、删容器重建缓存命中、优雅退出；
   uid 断言读 `/proc/1/status`（exec 是新进程，不继承 entrypoint 降权）；healthz 轮询防启动竞态；
   切换用户的 podman 包装器显式 HOME+XDG 三件套（runuser 保留调用者环境，防 XDG_CONFIG_HOME 泄漏）；
   full 矩阵追加 rootful+bind、非 1000 uid（CI 临时用户）、docker+bind。资源隔离+自动清理，
   失败先 dump 自有容器日志（含临时用户侧）再清理。
7. **release**：main 推 `:latest`+sha，tag 推 semver；**merge 后对 main 镜像重跑冒烟**（same-tree）。

main 分支保护 required checks：commitlint、secrets、docs-gate、node、image、smoke + 人工 approve。

## 本地预检

- `python3 scripts/docs-gate/gate.py --local`（无需网络）；门禁逻辑改动须过 `test_gate.py`。
- `bash scripts/test-local.sh [镜像引用]`：单元+契约 → gate → 可选 smoke。
- smoke 本地以 dev rootless 跑（零系统改动）；镜像来自 ghcr pr tag（本机不直连 docker.io）。

## agent 提交前自查清单

1. `git diff --name-only` 列改动文件。
2. 逐文件查 impact-map，列出应更新 docs/wiki；逐一确认或走豁免。
3. 行为/接口/决策变更 → history 条目（[格式](conventions.md#历史格式)）。
4. 跑 `gate.py --local` 预检。
5. 确认无密钥、无禁入文件；fixture 已脱敏。
6. commit message 合规（type/scope 英文 + subject 中文）。
7. 有人工残留项时：PR 清单逐项含完整命令（具体镜像 tag）+ 通过标准 + 清理命令，覆盖全部残留项。

## 豁免流程

确无需更新文档时：PR 加标签 `docs-nochange` + PR 评论说明理由。门禁记录豁免留痕，
人工验收审视豁免合理性。豁免不是常态，频繁豁免须反思图谱规则是否过宽。

## 图谱维护

新增目录/文件须登记 impact-map 规则（覆盖率强制）。规则本身变更须更新本文档并记 history。

## 全量语义审查（契约级）

机械门禁防漏改，不防语义漂移。**API 信封/CLI 调用契约级变更**（端点形状、错误码映射、
任务语义、fetch/降权契约）强制全量 docs+wiki 语义审查：附核对矩阵（doc 文件×变更事实），
全量读核对、搜剿旧表述残留、修不一致，结论记 history（含触发理由）。