# PPT Master Worker

这个服务把 [hugohe3/ppt-master](https://github.com/hugohe3/ppt-master) 的原生 PPTX 分析和模板填充能力暴露为 HTTPS API，供当前 Vite/Cloudflare 前端调用。PPT Master 固定到 `v4.1.0` 对应提交 `cad57e4a45d8664bf4830d85711d355dc2600455`。

## 本地或服务器启动

```bash
docker build -t gpt-image-ppt-worker .
docker run --rm -p 8080:8080 \
  -e PPT_WORKER_TOKEN=replace-with-a-long-random-token \
  -e PPT_WORKER_CORS_ORIGINS=https://your-frontend.example.com \
  gpt-image-ppt-worker
```

健康检查：`GET http://127.0.0.1:8080/health`

部署后，在应用的“设置 -> Agent -> PPT Master 服务”中填写 HTTPS 地址和相同令牌。令牌存储在浏览器本地，公网生产环境更推荐在 Worker 前增加 Cloudflare Access 或同源服务端代理。

## API

- `GET /health`：公开的容器健康检查。
- `GET /v1/health`：验证服务、版本和可选 Bearer Token，供应用的“测试连接”按钮使用。
- `POST /v1/analyze`：`multipart/form-data`，字段 `file=<pptx>`；返回模板主题、页面、插槽、表格、图表和模型上下文摘要。
- `POST /v1/fill`：`multipart/form-data`，字段 `file=<pptx>`、`plan=<JSON>`、`output_name=<name.pptx>`；先执行 `analyze` 和 `check-plan`，通过后执行 `apply` 并返回 PPTX。

环境变量：

- `PPT_WORKER_TOKEN`：可选 Bearer Token；生产环境应设置。
- `PPT_WORKER_CORS_ORIGINS`：逗号分隔的前端 Origin；默认 `*`。
- `PPT_WORKER_MAX_FILE_BYTES`：单个 PPTX 上限；默认 50 MB。
- `PPT_WORKER_PROCESS_TIMEOUT`：PPT Master 子进程超时秒数；默认 180。

## 许可证

PPT Master 使用 MIT License。完整许可文本保存在 `PPT_MASTER_LICENSE`，并随 Docker 镜像分发。
