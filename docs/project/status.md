# status — live 交接状态

> 每完成有意义步骤更新；收工前确认反映现实。环境事实见 devenv.md（gitignored）。

- updated: 2026-11-19T20:05+08:00

## 当前里程碑

M0 脚手架（见 [roadmap](roadmap.md)）。PR #1 开放，CI 进行中。

## done

- 六轮设计讨论定案（history 2026-11-19 各条）：API 双面一等公民、实测锚点、
  纪律/podman 策略、MIT+运行时 fetch、存储三分+自适应降权、godoword 约定借鉴+许可防火墙。
- 即梦 CLI 全类型实测（图/视频/音频/文本/并发/幂等/错误信封），fixture 已脱敏入仓。
- public 仓库 hinnyuu/jmapi 建立；MIT/LICENSE/NOTICE/.gitignore/README。
- 铁律文档体系 + clean-room docs-gate（11 回归）/smoke/清理脚本 + CI 六 job + release。
- M0 入口（降权/config/cache-first fetch/healthz/readyz/fail-closed）+ 26 单元契约测试全绿。
- PR #1 创建（GitHub 间歇超时经有界重试成功）；admin 死端口缺陷修正（history 2005）。

## in-flight

- CI 六 job（watch 后台监听）；绿后本机 dev rootless 对 pr-1 镜像跑 smoke。
- versions.lock baseDigest 待首 CI 回填。

## 下一动作

1. CI 全绿确认 → 本机 smoke → 汇总请用户残留 sign-off + approve merge。
2. baseDigest 回填 commit。
3. M1 OpenAI 面核心（models/images/videos/文件签名/积分帽执行）。

## blocked / 待拍板决策

- 无待拍板项（全部已定案，见 history）。
- 等用户确认：temp 阵地（含 live 测试凭据）退役删除；uhub 添加 node:22-slim；
  分支保护 + secret scanning 设置（member 权限不足时管理员操作）。

## 近期上下文

- api.github.com 间歇 TLS 超时：gh 操作有界重试纪律生效中；push 走 SSH 不受影响。
- 本机 podman 4.3.1 无 quadlet；dev 默认存储 vfs（历史固化），smoke 用 ghcr pr 镜像。