# 部署快速开始（podman 优先）

> 环境无关通用命令；本机特殊限制（内网镜像库等）见各机 devenv.md，不承载于此。

## 准备

```bash
mkdir -p jmapi-data/{config,state,output}
printf 'dailyCreditCap = 500\n' > jmapi-data/config/config.toml
export JMAPI_API_KEY="$(openssl rand -hex 32)"   # 妥善保存；泄漏=积分被烧
```

## rootless podman（推荐）

```bash
podman run -d --name jmapi \
  -p 8080:8080 \
  -e JMAPI_API_KEY="$JMAPI_API_KEY" \
  -e JMAPI_CLI_SOURCE="https://jimeng.jianying.com/novel-cli" \
  -v ./jmapi-data/config:/config:ro,Z \
  -v ./jmapi-data/state:/state:Z \
  -v ./jmapi-data/output:/output:Z \
  ghcr.io/hinnyuu/jmapi:latest
```

- 无需 keep-id/:U：entrypoint 按 /state 属主自适应降权，bind 文件永远归宿主用户。
- `:Z` 为 SELinux 私有标签（Fedora/RHEL 必需；无 SELinux 宿主无害）。凭据目录禁止共享给其他容器。
- 首启下载约 37MB 官方包并校验解包（readyz 503→200）；重启缓存命中零网络。
- 升级 CLI：`-e JMAPI_CLI_REFRESH=1` 重建容器，或 M2 起 admin refresh 端点。
- 离线/内网：bind 官方安装包 `-v ./package.tar.gz:/offline/package.tar.gz:ro,Z`
  并 `-e JMAPI_CLI_PACKAGE_FILE=/offline/package.tar.gz`（安装器脚本同理 JMAPI_CLI_INSTALLER_FILE）。
- 钉版：`-e JMAPI_CLI_PACKAGE_URL=<版本包URL> -e JMAPI_CLI_SHA256=<inner sha256>`。

## 登录（一次，浏览器授权）

M0 阶段在容器内执行 CLI（凭据落 /state）：

```bash
podman exec -it jmapi /state/cli/bin/jimeng-novel login --non-interactive -j
# 浏览器打开返回的 verificationUriComplete 确认授权，然后：
podman exec -it jmapi /state/cli/bin/jimeng-novel login --wait --device-code '<deviceCode>' --timeout 600s -j
```

M2 起 admin 面提供等价端点。admin 只绑**容器内** loopback（不 publish），宿主访问：

```bash
podman exec jmapi curl -s http://127.0.0.1:8081/admin/status
```

确需 LAN 直连 admin 时显式 opt-in：`-e JMAPI_ADMIN_BIND=0.0.0.0` 并自行以防火墙/ publish
绑定限制来源（自担风险；公网反代绝不代理 admin）。token 自动续期，长任务不必提前处理。

## rootful / docker 回退

rootful podman 或 docker：同命令去掉 rootless 前提即可；bind 属主 root 时 entrypoint
chown 1000 后降权；或改用命名卷（`-v jmapi-state:/state`）回避属主问题。
docker 宿主 SELinux 通常关闭，`:Z` 可保留（docker 忽略未知选项需去掉 Z——docker 用 `:z` 不支持时去除后缀）。

## systemd 常驻（podman≥4.4，Quadlet）

见 [quadlet/](../../deploy/quadlet/)：用户单元 + 单条 bare PublishPort 即双栈
（4.3 rootless 与 5.8 pasta 实测；追加 [::] 行会 bind 冲突）；`Pull=newer` 保证 mutable tag
复跑取新镜像；服务默认双栈监听 `::`（pasta v6 转发需容器 v6 socket，仅 IPv4 会 reset）；
`loginctl enable-linger $USER`。podman 4.3.x 无 Quadlet，用 run.sh + systemd 服务或自行升级。

## 公网反代（Caddy，个人使用）

见 [Caddyfile.example](../../deploy/Caddyfile.example)：只反代 /v1 与 /api 与 /files；
**admin 8081 不出公网**；TLS 自动 HTTPS；服务本体明文端口不暴露 WAN。
公网前确认：强 key、限流、积分帽、签名 URL 均已默认开启（SECURITY.md）。

## 后期制作（compose/frames）

默认镜像无 ffmpeg。两条路：① 宿主自装 ffmpeg，直接跑 /state 缓存里的 CLI 二进制；
② 自建变体镜像 `--build-arg WITH_FFMPEG=1`（GPL 合规自担，见 NOTICE）。

## 验收残留（需人工宿主）

SELinux enforcing 正/负例、Quadlet≥4.4、公网 Caddy 实测——本机/CI 覆盖不到，
按 [acceptance-runbook.md](acceptance-runbook.md) 执行（完整命令+通过标准+清理）。