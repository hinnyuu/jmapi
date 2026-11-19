# status — live 交接状态

> 每完成有意义步骤更新；收工前确认反映现实。环境事实见 devenv.md（gitignored）。

- updated: 2026-11-19T19:30+08:00

## 当前里程碑

M0 脚手架（见 [roadmap](roadmap.md)）。

## done

- 六轮设计讨论定案（history 2026-11-19 各条）：API 双面一等公民、实测锚点、
  纪律/podman 策略、MIT+运行时 fetch、存储三分+自适应降权、godoword 约定借鉴+许可防火墙。
- 即梦 CLI 全类型实测（图/视频/音频/文本/并发/幂等/错误信封），fixture 素材在临时目录待脱敏搬运。
- public 仓库 hinnyuu/jmapi 建立（bootstrap commit ece64fe）；MIT/LICENSE/NOTICE/.gitignore/README。
- 铁律文档体系：AGENTS/conventions/gates/impact-map 落地。

## in-flight

- M0：docs-gate 与 smoke.sh 由子 agent clean-room 实现中；主 agent 写 src/Containerfile/CI/deploy。
- fixture 脱敏搬运（temp/jimeng-test → test/fixtures），完成后 temp 目录退役。

## 下一动作

1. src 入口（降权/config/fetch/server）+ 单元/契约测试。
2. Containerfile + versions.lock + workflows + deploy 产物。
3. 本地 gate/test 预检 → M0 PR → CI 全绿 → 本机 dev rootless smoke（ghcr pr 镜像）。
4. 人工残留清单（SELinux/quadlet/公网 Caddy）→ 呼叫用户 approve+merge。

## blocked / 待拍板决策

- 无待拍板项（全部已定案，见 history）。
- 外部依赖：uhub 内网镜像 `uhub.service.ucloud.cn/hinnyuu/node:22-slim` 待主开发者添加
  （仅本机自建镜像需要；CI 与 ghcr 拉取不受阻）。
- member 权限若无法设置分支保护/secret scanning → 呼叫用户（尚未尝试）。

## 近期上下文

- 实测账号积分充足（测试共耗 38）；live 凭据当前在临时目录隔离 home，M0 后迁入挂载卷并退役临时目录。
- 本机 podman 4.3.1 无 quadlet；dev 默认存储 vfs（历史固化），测试用专用 overlay 存储或 CI 镜像。