# Sub2API 后台接入

当前应用把 Sub2API 的用户后台和模型网关分成两个独立入口：

- 用户认证、会话和用户 API Key：`/api/v1`
- OpenAI 兼容模型网关：`/v1`

## 前端构建变量

```env
VITE_DEFAULT_API_URL=https://sub2api.example.com/v1
VITE_SUB2API_AUTH_URL=https://sub2api.example.com/api/v1
VITE_SUB2API_AUTH_PROXY=true
VITE_SUB2API_AUTO_CONFIGURE=true
```

启用 `VITE_SUB2API_AUTH_PROXY` 后，浏览器请求同源 `/sub2api-auth/*`，避免依赖 Sub2API 的跨域配置。登录后如果当前默认 OpenAI 配置还没有 API Key，应用会复用该用户已有的有效 Key；没有可用 Key 时会创建名为 `OmniMuse` 的 Key。

## 项目内用户控制台

登录后的账户菜单会在当前站点打开 `#console`，展示账户概览、用量仪表盘、API 密钥管理、个人资料和应用设置入口。API 密钥页通过 Sub2API 官方接口提供名称搜索、分组与状态筛选、端点复制、创建、编辑、启停和删除，并展示分组、并发、用量、额度、到期时间及最近使用记录；用量仪表盘展示余额、请求与 Token 消耗、模型分布、趋势和最近调用记录。控制台不会再根据 `VITE_SUB2API_AUTH_URL` 推导或跳转到第三方 Sub2API 网站。

这个页面是本项目自己的用户控制台前端，账户和 API Key 数据仍通过同源 `/sub2api-auth/*` 代理读取配置的 Sub2API 服务。若需要完全自有的后台服务，需要把 Sub2API、PostgreSQL 和 Redis 部署到自己的服务器与域名，再更新 `VITE_DEFAULT_API_URL`、`VITE_SUB2API_AUTH_URL` 和服务端 `SUB2API_AUTH_URL`。官方 Sub2API 自带完整用户与管理控制台，自托管后的用户首页路由为 `/dashboard`。

## Cloudflare Pages

`functions/sub2api-auth/[[path]].ts` 默认连接 `https://sub2api.toioto.org/api/v1`。`worker.ts` 会在 Cloudflare Workers 部署中将 `/sub2api-auth/*` 路由到该代理；切换后台时配置：

```env
SUB2API_AUTH_URL=https://sub2api.example.com/api/v1
```

代理只允许 `/auth/*`、`/keys*`、只读的 `/settings/public` 和 `/groups/available`，精确匹配的 `/user/profile`、`/user`、`/user/password`，以及仪表盘与密钥列表所需的 `/usage`、`/usage/dashboard/stats`、`/usage/dashboard/trend`、`/usage/dashboard/models`、`/usage/dashboard/api-keys-usage` 路径，不接受浏览器传入动态目标地址。个人资料页通过用户路径读取和更新资料、修改密码；注册页通过公开设置同步邮箱验证和邀请码开关。

## 邮箱验证码

`/auth/send-verify-code` 成功只表示邮件任务进入 Sub2API 的异步队列，不代表 SMTP 已经投递成功。前端因此显示“发送请求已提交”，实际投递状态需要在 Sub2API 服务端日志中确认。

小规模测试可以使用 Gmail SMTP：

```text
Host: smtp.gmail.com
Port: 465
Username: 完整 Gmail 地址
Password: Google 应用专用密码
From: 与 Username 相同
TLS: 开启
```

不要使用 Gmail 登录密码，也不要把应用专用密码写入本仓库或前端环境变量。正式部署优先使用带自有域名的事务邮件服务，并配置 SPF、DKIM 和 DMARC。

排错时在 Sub2API 服务端日志中搜索 `EmailQueue`、`EMAIL_NOT_CONFIGURED`、`smtp connection failed`、`smtp authentication failed` 和 `failed to send verify code`。如果后台不由本项目维护，必须由该后台的运营方修复 SMTP，前端代理无法代替邮件服务器投递。

## Docker / Nginx

容器运行时通过 `SUB2API_AUTH_URL` 指定后台：

```bash
docker run -e SUB2API_AUTH_URL=https://sub2api.example.com/api/v1 ...
```

`deploy/nginx.conf` 会把 `/sub2api-auth/*` 转发到该地址。JWT 只用于 `/api/v1` 用户接口；图片生成仍使用用户 API Key 调用 `/v1`，两种凭证不能混用。
