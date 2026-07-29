# FreeModelFinder for macOS

FreeModelFinder for macOS 是一个纯状态栏工具。它随 App 自带本地 Gateway 和 Dashboard，用户机器无需安装 Node.js、npm 或系统级 daemon。

## 下载与首次打开

GitHub Release 提供两个独立安装包：

- `arm64`：Apple Silicon（M1、M2、M3、M4 及后续芯片）。
- `x64`：Intel Mac。

下载对应 DMG，把 FreeModelFinder 拖入“应用程序”。首版没有 Apple Developer ID，macOS 会阻止直接打开：

1. 先尝试打开一次 FreeModelFinder。
2. 打开“系统设置 → 隐私与安全性”。
3. 在安全性区域选择“仍要打开”，再次确认。

这是 Apple 为未签名或未公证软件提供的手动例外流程。只应从项目 GitHub Release 下载，并使用同一 Release 的 `SHA256SUMS` 校验文件。Apple 的完整说明见 [Open a Mac app from an unknown developer](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac)。

首次运行会询问是否初始化本地服务。初始化不需要管理员权限，只创建当前用户的配置和日志目录。服务就绪后，如果尚未配置 Provider，默认浏览器会自动进入新手引导；之后启动 App 不会自动打开浏览器。

## 状态栏行为

- 点击状态栏图标可选择 `auto`，或按 Provider → 模型切换默认模型。
- Dashboard 与状态栏最多约 2 秒完成双向同步。
- “打开 Dashboard”使用实际运行端口在默认浏览器打开页面。
- “登录时启动”默认关闭，可在菜单中开启。
- 从 Finder 启动时，App 会读取 macOS 当前启用的 HTTP/HTTPS 系统代理并传给本地服务；显式设置的代理环境变量优先。
- 退出 App 会关闭能够通过实例 ID 和控制令牌确认的 FreeModelFinder 服务；未知端口进程不会被终止。

配置仍位于 `~/.freemodelfinder`，因此 CLI 和 macOS App 共用 Provider Key、默认模型及 onboarding 状态。运行日志位于 `~/Library/Logs/FreeModelFinder`。

## 更新与卸载

App 每 24 小时检查一次稳定版 GitHub Release。发现新版时只显示下载入口，不会自行下载或替换 App。

卸载时退出 FreeModelFinder，再删除“应用程序”中的 App。保留 `~/.freemodelfinder` 可在重新安装后继续使用原配置；手动删除该目录会永久删除本地密钥和设置。

## 从源码构建

要求 Node.js 22.14+、pnpm 11、Rust 1.86+ 和 Xcode Command Line Tools：

```bash
pnpm install --frozen-lockfile
pnpm --filter @freemodelfinder/desktop build
```

构建脚本先导出 Dashboard，再把 Node 服务构建为当前 Mac 架构的 SEA sidecar，最后生成 `.app` 和 `.dmg`。Intel 与 Apple Silicon 制品必须分别在对应架构上构建。
