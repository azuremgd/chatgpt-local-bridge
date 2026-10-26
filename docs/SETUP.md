# Windows 安装与连接指南

本指南针对 DevSpace **1.0.8**。所有域名、ID 和路径示例均为占位信息，不能直接用于连接。

## 1. 检查依赖

在普通 PowerShell 中逐行执行：

```powershell
node --version
npm --version
git --version
cloudflared --version
npm list -g @waishnav/devspace --depth=0
```

要求 Node `>=22.19 <27`、Git for Windows（含 Git Bash）和 Cloudflare 的 `cloudflared`。优先沿用已有安装，不盲目重装。没有 DevSpace 时安装经过兼容性验证的版本：

```powershell
npm install --global @waishnav/devspace@1.0.8
```

如果已安装其他版本，不要直接覆盖已有工作环境。可用单独 npm prefix 安装 1.0.8，之后把它的 `dist/cli.js` 路径传给初始化脚本的 `-DevspaceCliPath`。运行目录需要和该安装一样保持在本机，不能提交到本项目。

参考上游：[DevSpace](https://github.com/Waishnav/devspace)、[Cloudflare Tunnel 文档](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)。最新版 DevSpace 安装文档可能描述较新的配置格式，本项目暂不支持该格式。

## 2. 创建命名隧道

先在 Cloudflare DNS 控制台确认目标子域名未被占用。不要覆盖已有 DNS 记录。

```powershell
cloudflared tunnel login
cloudflared tunnel create devspace-bridge
```

浏览器登录与域名授权由你亲自完成。记录返回的 Tunnel UUID。Cloudflare 会把凭证存到你的 `.cloudflared` 目录；不要复制文件内容到聊天、Issue 或 Git。

本项目使用 **locally managed named tunnel**；不接收 Tunnel Token，不使用临时随机域名。已经有隧道时可沿用，但应确认它专门用于本服务且不存在另一个运行中的管理器。

## 3. 初始化独立运行目录

在本项目目录执行。替换示例域名与 Tunnel UUID：

```powershell
.\scripts\Initialize-Bridge.ps1 -PublicUrl 'https://devspace.example.com' -TunnelId '00000000-0000-0000-0000-000000000000'
```

打包版使用同样参数运行根目录中的 `Setup.ps1`。

脚本会发现已安装的程序、要求你输入至少 24 字符的 Owner Password，并创建独立配置。推荐使用密码管理器生成的随机密码。输入不可见，密码不会被打印或写入命令行参数；它按 DevSpace 1.0.8 的原生格式保存在本地 `config/auth.json`。运行目录的 ACL 限制为当前用户与 SYSTEM。不要以管理员身份运行。

默认运行目录：`%USERPROFILE%\DevSpaceBridge`。默认只授权其中的空 `workspace` 测试目录。不会读取或迁移原来的 `~/.devspace/auth.json`，也不会接管既有项目权限。

可选参数：

| 参数 | 用途 |
| --- | --- |
| `-RuntimeDirectory` | 专用运行目录，必须在源码目录之外 |
| `-ProjectDirectory` | 只授权一个指定项目，省略时使用空测试目录 |
| `-Port` | 本地端口，默认 7676；已有服务占用时选择其他端口 |
| `-NodePath` | 外部 Node 可执行文件绝对路径 |
| `-DevspaceCliPath` | 已安装的 DevSpace 1.0.8 `dist/cli.js` |
| `-CloudflaredPath` | cloudflared 可执行文件绝对路径 |
| `-BashDirectory` | 包含 `bash.exe` 的 Git Bash 目录 |
| `-CredentialsFile` | 本机 Tunnel UUID 凭证 JSON 的绝对路径 |

使用自定义运行目录时，在启动应用前设置同一值：

```powershell
$env:DEVSPACE_BRIDGE_HOME = 'D:\LocalTools\DevSpaceBridge'
npm start
```

该环境变量只影响当前 PowerShell 及其子进程。打包版从这个窗口运行其 `.exe`。要通过快捷方式长期使用自定义目录，可手动设置当前用户的环境变量；应用不会替你修改系统设置。

初始化脚本拒绝覆盖已存在的配置。首次初始化失败时，先检查错误；不要反复重装。脚本未写入任何配置时可以在它创建的空运行目录上重试。已写入部分配置时，保留目录供检查，换一个新的专用运行目录，避免意外覆盖凭证。

初始化和桌面启动都会拒绝管理员令牌、敏感目录、目录联接和不合格的现有权限。不要手工预建运行目录；让程序在已存在的安全父目录下创建一个新的专用目录。旧版本创建的目录若仍有额外权限，不会被自动修改，请先保留原目录供审查，再使用新的目录完成初始化。

## 4. 配置 DNS 与完整 HTTP 路由

确认子域名空闲后执行：

```powershell
cloudflared tunnel route dns devspace-bridge devspace.example.com
```

把示例替换成你实际创建的隧道名称和域名。脚本生成的 `cloudflared/config.yml` 会把该域名的**所有路径**代理到 `http://127.0.0.1:7676`（或你选择的端口），并用末尾 404 规则拒绝其他主机。

不能只映射 `/mcp`：OAuth 发现、授权和令牌路由也必须到达 DevSpace。不要把本地管理界面加入公网路由。

启动前可检查 ingress 配置语法（自定义运行目录请替换路径）：

```powershell
cloudflared tunnel --config "$env:USERPROFILE\DevSpaceBridge\cloudflared\config.yml" ingress validate
```

语法通过不代表 DNS、OAuth 或网页工具调用已经成功。Cloudflare Access 可能影响 OAuth/MCP 客户端兼容性，本指南不自动开启。

## 5. 启动与诊断

```powershell
npm ci
npm test
npm start
```

或打开打包版的 `DevSpace Bridge Console.exe`。点击“启动连接”，再点击“检查连接”。应看到：

首次启动连接时会出现 Shell 权限与数据传输确认：白名单不能限制 Shell 的全部访问能力，工具结果会通过 Cloudflare 传到 ChatGPT。取消时不会启动服务；确认会记录在本地运行目录。应用拒绝以管理员令牌运行。

1. 本地 `/healthz`：HTTP 200。
2. 公网 `/healthz`：HTTP 200。
3. OAuth discovery：HTTP 200，issuer 和授权端点指向你的 HTTPS 域名。
4. 未登录请求 `/mcp`：HTTP **401**，这是认证保护正常的表现。
5. 环境检查：Node、Git Bash、SQLite 和配置正常。

探测来自本机，经公网域名回到隧道；它不能证明 ChatGPT 所在网络一定能够访问。公网连通性失败时，查看本机服务日志与隧道日志。

## 6. 添加到 ChatGPT 网页

在 ChatGPT 网页设置中寻找 Apps / 自定义连接器 / 开发者模式相关入口（名称与可用性取决于账号、组织设置和产品版本）。创建自定义 MCP，地址填写：

```text
https://devspace.example.com/mcp
```

按网页提示执行 OAuth 授权，在属于你域名的批准页输入自己的 Owner Password。只有你明确打算授权该客户端时才输入。不要把密码作为聊天消息发送。

连接后，在网页对话中选中该应用，让它列出测试目录文件或创建一个无敏感内容的测试文件，确认实际工具调用成功。此步骤需要你在网页完成；控制台不会显示未经验证的“网页调用成功”。

## 7. 日常使用

- 关闭窗口：保留托盘与服务。
- 停止连接：停止本控制台启动的两个进程。
- 退出控制台：询问后停止所管理的服务并退出。
- 添加或移除目录：保存后“应用并重启”；移除授权不会删除文件。
- 外部服务占用端口：在原来的启动器停止，点击重新检测。控制台不会强杀外部进程。
- 重启电脑后：手动打开控制台并启动连接，没有开机自启。
- 彻底撤销网页客户端：使用设置页的“撤销授权”，详见 [撤销与恢复](REVOKE.md)。改 Owner Password 或暂时停服不能代替撤销令牌。

`examples/` 中的文件仅用于理解结构。它们不包含密码，不能替代初始化生成的有效配置。
