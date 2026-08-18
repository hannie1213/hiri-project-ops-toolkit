# 部署指南

本平台为全栈 Next.js + PostgreSQL 应用，提供四种部署方式，按场景选择。

## 通用准备

1. 生成安全密钥（用于 JWT 签名）：
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
2. 准备数据库连接串：`postgresql://用户:密码@主机:5432/数据库?schema=public`
3. 修改初始管理员密码（环境变量 `SEED_ADMIN_PASSWORD`）

---

## 方式一：Docker Compose（推荐 · 内网/单机）

```bash
# 1. 克隆/上传代码到服务器
# 2. 配置 .env（AUTH_SECRET 等）
docker compose up -d --build
# 访问 http://服务器IP:3000
```

- 首次启动自动建表（`prisma db push`）
- 数据持久化在 `pgdata` 卷，升级不丢数据
- 升级：`git pull && docker compose up -d --build`

## 方式二：云主机 / VPS（Docker 单容器）

```bash
# 使用 Dockerfile 构建镜像
docker build -t product-tool .

# 运行（外部数据库）
docker run -d --name product-tool \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e AUTH_SECRET="..." \
  -e SEED_ADMIN_PASSWORD="..." \
  --restart unless-stopped \
  product-tool
```

配合 Nginx 反向代理 + HTTPS：

```nginx
server {
  listen 443 ssl;
  server_name tool.example.com;
  ssl_certificate     /etc/nginx/certs/fullchain.pem;
  ssl_certificate_key /etc/nginx/certs/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    client_max_body_size 20m;
  }
}
```

## 方式三：NAS（群晖 Synology / 威联通 QNAP）

群晖「Container Manager」（原 Docker 套件）：

1. 安装 Container Manager 套件
2. 将本项目文件夹拷贝到 NAS（如 `/volume1/docker/project-tool`）
3. 打开 Container Manager → 项目 → 新增 → 选择该目录 → 使用 `docker-compose.yml`
4. 设置环境变量（AUTH_SECRET 等）→ 启动
5. 通过 `http://NAS-IP:3000` 访问；如需域名可配反向代理

威联通操作类似（Container Station）。

## 方式四：CloudBase 云托管（CodeBuddy 内置部署）

> 在 CodeBuddy 内使用「部署」能力将本项目发布到腾讯云 CloudBase。

1. 项目根目录已配置 `Dockerfile`（多阶段构建，产物为 standalone）
2. 在 CodeBuddy 中执行部署，选择 **CloudBase 云托管（CloudRun）**
3. 配置环境变量：
   | 变量 | 说明 |
   | --- | --- |
   | `DATABASE_URL` | 云数据库连接串（腾讯云 PostgreSQL / 自建） |
   | `AUTH_SECRET` | JWT 签名密钥（务必修改） |
   | `SEED_ADMIN_PASSWORD` | 初始管理员密码 |
   | `NEXT_PUBLIC_APP_URL` | 访问域名 |
4. 首次启动自动建表；如需固定数据库建议购买 TencentDB for PostgreSQL

## 数据库初始化说明

容器启动时执行：`prisma db push --accept-data-loss`（幂等，仅建表/补列，不删数据）。

如需初始化种子账号，在应用启动后手动执行：

```bash
# 进入应用容器
docker exec -it pt_app sh
# 执行种子（建管理员/周报人员）
node node_modules/.bin/tsx prisma/seed.ts
```

> 种子脚本在容器内可通过 `npm run db:seed` 运行（需要 devDependencies，生产镜像未包含时改用上述方式）。

## 备份

```bash
# PostgreSQL 备份
docker exec pt_postgres pg_dump -U postgres project_tool > backup_$(date +%Y%m%d).sql
# 恢复
cat backup_xxx.sql | docker exec -i pt_postgres psql -U postgres project_tool
```

## 安全建议

- [ ] 修改 `AUTH_SECRET` 为随机长字符串
- [ ] 修改默认管理员密码
- [ ] 使用 HTTPS（Cookie 自动带 Secure 标记）
- [ ] 定期备份数据库
- [ ] 仅开放需要的端口（3000 / 5432 内网）
- [ ] 登录 Cookie 12 小时过期，会话在服务端校验
