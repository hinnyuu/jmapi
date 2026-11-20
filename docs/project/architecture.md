# architecture — 组件与契约（当前事实）

## 组件

```
entrypoint.mjs   容器入口：建目录 → 自适应降权 → 载配置 → 起 HTTP → 后台 fetch
demote.mjs       stat /state 属主（**容器侧 uid**，rootless 下已是映射结果）→ 直接以其为
                 降权目标（setgroups→setgid→setuid）；uid_map 仅区分 rootful/rootless
                 与识别溢出属主 65534（宿主 root bind 无映射 → EACCES 提示）；
                 rootful+root 属主 → chown 1000 再降；PUID/PGID 覆盖
config.mjs       config.toml（smol-toml）+ env 覆盖（env 优先）+ SIGHUP 热重载非秘密项
fetch.mjs        cache-first：缓存 inner-sha 复验命中 → 零网络；否则 curl 官方安装器 →
                 取 DEFAULT_PACKAGE_URL → 下载 package.tar.gz 存缓存 → 官方安装器
                 --package-file 校验解包（--prefix/--bin-dir/--skills-dir 缓存内、
                 --no-modify-path、遥测关）→ meta.json{version(内层包名解析),bundle,
                 release(带 sha12 后缀的实际目录名),innerSha,fetchedAt}；
                 **全异步子进程**（事件循环自由：fetch 期间 healthz/readyz 可响应、SIGTERM 有效）；
                 离线：JMAPI_CLI_INSTALLER_FILE / JMAPI_CLI_PACKAGE_FILE bind；
                 钉版：JMAPI_CLI_PACKAGE_URL + JMAPI_CLI_SHA256；刷新：JMAPI_CLI_REFRESH=1
server.mjs       node:http；8080 业务（**默认 bind :: 双栈**，无 IPv6 netns 回退 0.0.0.0 告警；
                 pasta 把宿主 v6 指向容器 v6 socket，仅 IPv4 监听致 v6 reset，实测）
                 + 8081 admin（容器内 loopback，不 publish，
                 宿主经 podman exec 访问；LAN 直连须 JMAPI_ADMIN_BIND opt-in）；
                 healthz 恒 200；readyz fetch 就绪前 503；Bearer fail-closed 401；
                 未实现端点 501；SIGTERM 优雅退出；日志 JSON 脱敏
cli.mjs          spawn 缓存二进制 -j；解析 {status,data,error,context} 信封；
                 超时/running 语义透传（不自动重提）
jobs.mjs         append-only JSONL ledger（state/jobs.jsonl）+ 启动重建索引（last-wins、
                 损坏行跳过）；task id ↔ thread_id/run_id；day=UTC 结算日供积分帽累计；
                 ensureOutDir 预建（CLI 不建目录）；isWritePathError 落盘失败可重试语义；
                 completed 结算清 error
files.mjs        HMAC-SHA256 签名 URL（exp+sig，apiKey 为密钥）；文件名白名单+路径防穿越；
                 签名即凭证（/files 免 Bearer）；content-type 按扩展名
routes/openai.mjs models/images 同步/videos 异步/content/jobs 通用；size→最近 ratio；
                 错误映射 AUTH→502/INVALID_ARGUMENT→400/其余 502+logId；
                 running≠失败：images 超时 504+jobId 轮询扩展端点
routes/dashscope.mjs 异步任务面（X-DashScope-Async 强制）；共享 jobs；DS_STATUS 映射；
                 task 查询按 kind 轮询（video query-result / script script result）
routes/audio.mjs speech=qwen_tts 流式 wav（voice 忽略）；generations=seed_audio 签名 URL
routes/script.mjs outline/episode；隐藏绑定 state/script 首次 init；execCli cwd 支持
admin            login/login wait/cli refresh/config reload（loopback/LAN only）
server.mjs       guards：per-key 分钟窗口限流 + 生成类全局并发闸（429）；readBody 上限 413
                 （drain 不 destroy）；**JSON + multipart 纯字段双解析**（SDK videos.create
                 发 multipart，实测抓出；文件部分 400）；/files 签名面；/v1 分发；/api 501（M2）
routes/dashscope/*（M2）异步任务别名层，共享 jobs
```

## 存储三分（bind，rootless 自适应降权解决所有权）

| 挂载 | 模式 | 内容 |
|---|---|---|
| /config | ro + :Z | config.toml（operator 宿主编辑） |
| /state | rw + :Z | cli/ 缓存+meta、**home/（CLI HOME，凭据落此，重启不丢）**、jobs ledger |
| /output | rw + :Z | 生成产物（--out 落盘，run_id-assetId 命名，从不覆盖） |

命名卷为 rootful/回退选项；凭据目录禁止多容器共享。

## API 门面原则

架在**一次性命令**上（generate-image/video/audio + query-result、script outline/episode/result），
调用方无状态；不暴露画布/项目/节点。独立一次性生成可并发（实测互不干扰）；
login/logout 串行；同节点修改串行（CLI 约束）。错误信封翻译保留 logId/错误码/hint。

## 并发与资源模型

宿主可能 2H2G：全局并发闸 + per-key 限流 + 请求体上限；超限 429/标准错误信封。
视频异步（p50 221s 量级），图片同步（--wait 150 内，实测 38-40s）。

## 安全面

key fail-closed；admin 只绑 loopback/LAN；产物 URL HMAC 短期签名；积分帽默认 500/天
（UTC 日界，查询不受限）；TLS 只在 Caddy 边缘；日志脱敏。

## 供应链

versions.lock 钉基础镜像 tag+digest（digest 首 CI 后回填）、CLI 版本包 URL+inner sha256；
构建期 digest 比对；启动期缓存复验；CI 工具（gitleaks）钉版+checksum 后执行。

## 部署单元

Quadlet（podman≥4.4）：单条 bare `PublishPort=8080:8080` 即双栈（4.3 rootless 与 5.8 pasta
实测 v4/v6 皆通；追加 `[::]` 行与 bare 双栈 socket 冲突致启动失败，实测复现）；
admin 不 publish；TimeoutStartSec=300 容纳首启 fetch。