# FreeModelFinder 排障指南

## 端口被占用

停止已经占用端口的进程，或者为本地模式指定其他端口：

```bash
fmf serve --port 11436
```

FreeModelFinder 始终绑定 `127.0.0.1`，不提供远程监听参数。显式服务器模式也只创建 loopback 监听器，并通过受控的反向代理提供外部入口。

## 浏览器没有自动打开

复制终端显示的 Web UI 地址，在浏览器中手动打开。浏览器打开失败不会导致服务进程退出。

## Provider 没有模型

在 Dashboard 的设置页查看该 Provider 的错误信息，并依次确认：

- API Key 是否有效并已经保存。
- 当前账号、地区是否具备模型资格。
- 免费额度是否已经耗尽。
- Provider 模型目录是否临时不可用。
- HTTP/HTTPS 代理是否能访问对应平台。

同步失败时，FreeModelFinder 会显示失败来源，并尽量保留上一轮成功同步的目录，不会把失败伪装成空目录。

## 环境变量导入

首次向导只报告受支持的 Provider 环境变量是否存在，不会把原始值返回浏览器，也不会自动导入。只有用户显式确认后，服务端才会从允许列表中读取对应变量并保存到本机加密配置。

## 配置目录

默认配置位于：

```text
~/.freemodelfinder/config.json   # version 2 配置；密文格式 v3
~/.freemodelfinder/master.key    # 本机随机主密钥
```

如果默认目录不可写，macOS 沙箱开发环境会退回 `~/Library/Caches/FreeModelFinder`。测试或多实例运行时可以显式指定目录：

```bash
FREEMODELFINDER_HOME=/path/to/fmf-home fmf serve
```

## 代理与日志

出站 Provider 请求读取 `HTTPS_PROXY`、`HTTP_PROXY`、`ALL_PROXY` 及对应小写变量，只支持 HTTP/HTTPS 代理。

CLI 模式可通过 `LOG_LEVEL` 调整 Fastify 日志级别，例如：

```bash
LOG_LEVEL=debug fmf serve
```

CLI 日志写到当前终端，不会默认创建日志文件。macOS 状态栏 App 的运行日志位于 `~/Library/Logs/FreeModelFinder`；服务异常时也可以从状态栏菜单打开日志文件夹。

## 重置配置

先停止 `fmf serve` 或退出 macOS 状态栏 App，再删除整个配置目录。此操作不可恢复，会删除全部 Provider Key、Gateway Key、自定义来源和设置。

Unix：

```bash
rm -rf ~/.freemodelfinder
```

PowerShell：

```powershell
Remove-Item -Recurse -Force "$HOME/.freemodelfinder"
```

如果设置过 `FREEMODELFINDER_HOME`，请确认实际目录后再删除，不要直接复制上述默认路径。

## 卸载

卸载 npm CLI：

```bash
npm uninstall -g freemodelfinder
```

卸载 macOS App 时，先退出 FreeModelFinder，再从“应用程序”中删除 App。卸载程序不会自动删除 `~/.freemodelfinder`；保留该目录可在重新安装后继续使用原配置。
