# 服务器模式部署

服务器模式把管理网页和公网兼容 API 分成两个只监听 loopback 的服务：

- `127.0.0.1:11435`：管理网页与管理 API，由 Tailscale Serve 提供私有 HTTPS 访问。
- `127.0.0.1:11436`：强制 Gateway Key 的兼容 API，由 Nginx 提供公网 HTTPS 访问。

FreeModelFinder 不会监听 `0.0.0.0`，也不会代替管理员安装或控制 Tailscale、Nginx 和 Certbot。

## 前提

- 一台具有稳定公网 IP 的 Linux 服务器。
- Node.js 22.14+，以及已安装的 `freemodelfinder`。
- Tailscale、Nginx 和 Certbot 5.4+。
- 云安全组只向公网开放 TCP 80、443 和受限制的 SSH；不得开放 11435、11436。

以下示例中的 `PUBLIC_IP`、`ADMIN_ORIGIN`、`FMF_USER` 和 `YOUR_TAILSCALE_LOGIN` 都必须替换为实际值。

## 1. 配置服务用户和 systemd

创建专用非 root 用户及配置目录：

```bash
sudo useradd --system --home /var/lib/freemodelfinder --create-home fmf
sudo chmod 700 /var/lib/freemodelfinder
```

复制 `deploy/server/freemodelfinder.service` 到 `/etc/systemd/system/`，替换模板变量，然后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now freemodelfinder
sudo systemctl status freemodelfinder
```

服务器模式首次启动会自动生成并加密保存 Gateway Key，且不会把 Key 输出到日志。

## 2. 配置 Tailscale 管理入口

给服务器设置 `tag:fmf-server`，并把 `deploy/server/tailscale-policy.hujson` 中的规则合并到 tailnet policy。不要启用 Funnel。

将管理 Origin 对应的 Tailscale HTTPS 地址代理到管理端口：

```bash
tailscale serve --bg http://127.0.0.1:11435
tailscale serve status
```

浏览器打开 `ADMIN_ORIGIN`，在设置页查看或轮换 Gateway Key。服务只接受启动参数中精确配置的管理 Origin，不接受 `*.ts.net` 通配域名。

## 3. 申请公网 IP 证书

先创建 ACME webroot，并把 `deploy/server/nginx.conf`、`freemodelfinder-proxy.conf` 放到对应的 Nginx 配置位置。Nginx 的 `listen` 必须填写具体公网 IP，不能写成监听所有地址，否则可能与 Tailscale Serve 的 443 冲突。

```bash
sudo mkdir -p /var/www/certbot
sudo certbot certonly --staging --preferred-profile shortlived --webroot \
  --webroot-path /var/www/certbot --ip-address PUBLIC_IP
```

staging 验证成功后删除 `--staging` 再申请生产证书。Let’s Encrypt IP 证书有效期约 160 小时，复制 `freemodelfinder-cert-renew.service` 与 `.timer` 到 `/etc/systemd/system/`，由它们每 12 小时检查续期并在成功后 reload Nginx。

```bash
systemctl list-timers | grep freemodelfinder
sudo certbot renew --dry-run
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable --now freemodelfinder-cert-renew.timer
```

## 4. 验证部署

在服务器上执行：

```bash
fmf doctor server \
  --admin-url ADMIN_ORIGIN \
  --public-url https://PUBLIC_IP
```

doctor 会验证两个本地监听器、Tailscale 管理入口、Gateway Key、危险公网路由和证书剩余有效期。检查输出不会包含完整 Key。

将 `freemodelfinder-doctor.service` 与 `.timer` 中的模板变量替换后安装并启用，可以每 12 小时重复检查；证书剩余时间不足 48 小时会令任务失败并写入 systemd 日志，生产环境可再把该 unit 的失败状态接入现有告警系统。

```bash
sudo systemctl enable --now freemodelfinder-doctor.timer
```

公网客户端使用：

```text
OpenAI Base URL:    https://PUBLIC_IP/v1
Anthropic Base URL: https://PUBLIC_IP
Gemini Base URL:    https://PUBLIC_IP/v1beta
```

所有请求都必须携带设置页显示的 Gateway Key。
