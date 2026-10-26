# 撤销网页端 OAuth 授权

需要彻底断开某次授权时，请使用控制台“设置 → 撤销所有网页授权”。这会先停止本控制台启动的连接，再撤销这个运行目录内的**全部客户端**。目前不提供单客户端撤销。

撤销包括持久化的访问令牌、刷新令牌和客户端注册；不会删除项目文件、Owner Password、目录白名单或数据库中其他会话数据。事务执行后旧令牌在重启后仍然无效。停止进程也会清除内存中的未使用授权码。恢复连接后，在 ChatGPT 删除旧连接、重新添加同一 MCP 地址，并亲自完成 OAuth 授权。

如控制台无法打开，可在普通 PowerShell 中操作：

1. 从各自启动器停止所有 DevSpace 服务与隧道，退出控制台。脚本不会强杀外部进程。
2. 在源码目录执行以下命令；打包版改用 `resources\app\scripts\revoke-oauth.cjs`。使用与 DevSpace 安装兼容的外部 Node。

```powershell
$env:DEVSPACE_BRIDGE_HOME = Join-Path $env:USERPROFILE 'DevSpaceBridge'
node .\scripts\revoke-oauth.cjs --all
```

脚本必须成功退出并返回三项撤销数量才算完成。它先验证运行目录、DevSpace 版本和状态路径，再独占本地端口并检查运行中的 DevSpace。存在其他 DevSpace 实例时会保守拒绝，即使它使用不同端口。数据库不存在时返回零。运行期间保留 `state\oauth-maintenance.lock`，控制台会拒绝启动连接。

若进程崩溃留下维护锁：确认所有 DevSpace 和撤销程序均已停止，检查该运行目录无未完成操作后，手动删除这个单独的锁文件，再重新运行撤销。不要删除整个数据库或运行目录，也不要为了通过检查放宽目录权限。

**改密码不等于撤销令牌。** 如果 Owner Password 已泄露，应先停止服务、撤销全部授权，再在本机安全地更换密码，之后才重新开放隧道；否则知道旧密码的人仍可重新申请授权。Cloudflare 隧道凭证泄露应在 Cloudflare 另行撤销/轮换。本功能不代替这两项操作。

验证证据：自动化测试使用固定版本的真实 DevSpace OAuth provider，确认改 Owner Password 后旧访问令牌仍有效；执行撤销并重建 provider 后，旧访问令牌、刷新令牌和客户端注册失效，其他 SQLite 表仍在。此测试使用临时数据，不读取个人认证数据库。它不代表已经完成 ChatGPT 网页重新授权验收。
