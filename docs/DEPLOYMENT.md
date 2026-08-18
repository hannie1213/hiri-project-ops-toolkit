# Netlify 手动部署

本项目不需要 GitHub、服务器、数据库、账号或 VPN。

## 生成部署目录

在项目根目录执行：

```bash
npm install
npm run build
```

成功后会生成 `dist`。可先确认其中包含 `index.html` 和 `_redirects`。

## Netlify Drop

1. 登录 Netlify，打开 Netlify Drop。
2. 将整个 `dist` 文件夹拖入上传区域。
3. 等待上传完成后访问 Netlify 提供的网址。

如果使用 Netlify 的手动项目配置，构建命令为 `npm run build`，发布目录为 `dist`。根目录的 `netlify.toml` 已包含这两项配置。

SPA 回退文件内容为：

```text
/* /index.html 200
```

## 更新网站

代码更新后重新执行 `npm run build`，再将新的 `dist` 目录拖到站点的 Deploys 页面。浏览器中的 IndexedDB 数据属于站点域名；在同一域名部署新版通常不会删除数据，但重要变更前仍建议导出 JSON 备份。
