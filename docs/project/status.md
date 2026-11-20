# status — live 交接状态

> 每完成有意义步骤更新；收工前确认反映现实。环境事实见 devenv.md（gitignored）。

- updated: 2026-11-19T21:10+08:00

## 当前里程碑

M0 脚手架 **merge 就绪**：七轮 CI 全绿（full 矩阵 smoke + baseDigest 比对通过，
uhub 镜像与 docker.io digest 一致）；本机 dev rootless smoke 14/14；
PR #1 mergeable，BLOCKED 仅待人工 approve（分支保护设计如此）。

## done

- 六轮设计讨论定案（history 2026-11-19 各条）：API 双面一等公民、实测锚点、
  纪律/podman 策略、MIT+运行时 fetch、存储三分+自适应降权、godoword 约定借鉴+许可防火墙。
- 即梦 CLI 全类型实测（图/视频/音频/文本/并发/幂等/错误信封），fixture 已脱敏入仓。
- public 仓库 hinnyuu/jmapi 建立；MIT/LICENSE/NOTICE/.gitignore/README。
- 铁律文档体系 + clean-room docs-gate（11 回归）/smoke/清理脚本 + CI 六 job + release。
- M0 入口（降权/config/cache-first fetch/healthz/readyz/fail-closed）+ 26 单元契约测试全绿。
- PR #1 创建（GitHub 间歇超时经有界重试成功）；admin 死端口缺陷修正（history 2005）。
- 二轮 CI 抓降权二次映射缺陷 + 本机预验抓 release 目录 sha12 后缀缺陷，均修复（history 2030）；
  本机全链路预验：首启 8s readyz 200、二启 cache hit 4s 200。
- 三轮 CI 抓 gidMap 死参数（lint）已移除；四轮 smoke 17 PASS/5 FAIL → 测量缺陷三处修正
  （healthz 竞态/exec uid 假红/version 正则）+ T6 诊断补强（history 2045）；五轮 T6 根因
  XDG_CONFIG_HOME 泄漏修复（history 2055）；六七轮全绿（full 矩阵 + baseDigest 比对）。
- 八轮 CI 全绿；用户批评残留清单潦草 → runbook 纪律立规 + 完整 runbook 入仓
  （wiki/deploy/acceptance-runbook.md）+ PR 正文重写（history 2026-11-20-1111）。
- 九轮 secrets 红 → gitleaks 白名单 schema 缺陷（复数被忽略/regexTarget/熵阈值假绿）
  修复 + 负例锚定（history 2026-11-20-1122）；十轮 secrets 绿。
- 十轮 smoke T1 healthz 15s 窗口在慢 runner 上假红 → 轮询上限提 60s；**十一、十二轮六 job 全绿**。
- 用户 PR 评论三缺陷 → runbook v3（logs 证据/fresh 负例/REF 字面量/Caddy 拆分，history 1310）；
  T8 落地抓 fetch 事件循环阻塞真缺陷（异步化+响应性负例）与宿主 quirks 链（history 1314）；
  **本机 smoke 19/19 全绿含 T8 自签 TLS**；**十三轮六 job 全绿（CI T8 通过）**。
- M0 机器侧完毕：PR #1 mergeable；**项 1 正例+fresh 负例用户实测全部符合预期（history 1400/1416）**；
  项 2 quadlet 首跑失败 → [::] 行 bind 冲突修复（单条 bare，history 1416），待用户新 REF 复跑；
  项 3 WAN 待测；sign-off + approve 待用户。
- 仓库设置落地：分支保护（6 checks+1 approve+enforce_admins）、squash-only、secret scanning+push protection。
- uhub node:22-slim 已添加并 pull 验证；temp 阵地已退役（用户确认，仅删自有两目录）。

## in-flight

- CI 第八轮（status 收敛 commit 触发，watch 监听）；绿后请用户 approve+merge。
- merge 后：release 对 main 镜像重跑冒烟（same-tree）；M1 开工。

## 下一动作

1. CI 全绿确认 → 本机 smoke → 汇总请用户残留 sign-off + approve merge。
2. baseDigest 回填 commit。
3. M1 OpenAI 面核心（models/images/videos/文件签名/积分帽执行）。

## blocked / 待拍板决策

- 无待拍板项（全部已定案，见 history）；用户确认项均已落地（temp 退役/uhub/仓库设置）。
- 待人工：PR 残留清单 sign-off（SELinux/Quadlet/公网 Caddy）+ approve merge。

## 近期上下文

- api.github.com 间歇 TLS 超时：gh 操作有界重试纪律生效中；push 走 SSH 不受影响。
- 本机 podman 4.3.1 无 quadlet；dev 默认存储 vfs（历史固化），smoke 用 ghcr pr 镜像。