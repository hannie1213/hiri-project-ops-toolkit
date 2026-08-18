# 产品项目部工具优化平台

多用户、可部署的**项目进度监控 + 周报收集**内网平台。从本地单机 Electron 工具升级为浏览器访问的共享系统。

## 功能总览

| 模块 | 说明 |
| --- | --- |
| 项目监控 | Excel 导入 / 手工录入 / 编辑 / 删除（乐观锁），多 PM 自动拆分 |
| 状态规则 | 待补实际日期、有延期风险、验收终审、日期待核对、7/14/30/60 天到期提醒 |
| 周报收集 | 按周收集成员周报，A/B/C 三组合并（保留格式），钉钉/企业微信复制粘贴 |
| 权限体系 | ADMIN / SUPERVISOR / PM / VIEWER 四角色，服务端逐接口校验 |
| 审计日志 | 登录、增删改、导入、合并、导出全量留痕 |
| 部署 | Docker / 云主机 / NAS / CloudBase，一套 Dockerfile 通用 |

## 技术栈

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**（原子样式，浅色主题）
- **Prisma ORM + PostgreSQL**（服务端数据库，无 localStorage）
- **jose**（JWT httpOnly Cookie）+ **bcryptjs**（密码哈希）
- **exceljs**（Excel 读写）
- **vitest**（验收规则自动化测试）

## 快速开始

### 1. 环境要求

- Node.js ≥ 20（推荐 22）
- PostgreSQL ≥ 14（或用 docker-compose 一键启动）
- 国内网络建议配置 npm 镜像：`npm config set registry https://registry.npmmirror.com`

### 2. 安装与初始化

```bash
npm install
cp .env.example .env        # 修改 DATABASE_URL 与 AUTH_SECRET
npx prisma generate          # 生成 Prisma Client
npx prisma db push           # 建表（开发环境）
npm run db:seed              # 初始化管理员/周报人员账号
```

### 3. 启动

```bash
npm run dev                  # http://localhost:3000
```

### 4. Docker 一键启动（推荐）

```bash
docker compose up -d --build
```

### 5. 测试

```bash
npm test                     # 运行验收规则自动化测试（28 个用例）
```

## 默认账号

| 角色 | 用户名 | 密码 | 说明 |
| --- | --- | --- | --- |
| 管理员 | admin | Admin@123456 | 全部权限，可管用户/导入/合并 |
| 主管 | supervisor | Sup@12345 | 可编辑全部项目、导入、合并周报 |
| 项目经理 | pm | Pm@12345 | 仅见自己负责的项目 |
| 访客 | viewer | View@12345 | 只读 |
| 周报人员 | 缩写（如 zs） | Abc@12345 | 提交个人周报 |

> ⚠️ 生产部署后请务必通过环境变量修改默认密码。

## 核心业务规则

1. **实际日期为空 ≠ 逾期**：节点只展示「待补实际日期」；
2. **非验收节点计划已过无实际** → 项目标记「有延期风险」；
3. **验收终审**：项目是否完成只看「验收」节点的实际日期；
4. **已验收项目**从到期提醒/跟进中排除；
5. **7 / 14 / 30 / 60 天**到期窗口；
6. **日期待核对**：实际日期早于计划日期、无计划却有实际、实际日期晚于今天；
7. **多 PM 拆分**：`/`、`、`、`，`、`,`、`;`、换行。

详见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) 与 `tests/status.test.ts`。

## Excel 导入格式

工作表名：**所有项目进度计划情况**

| 项目名称 | 项目编号 | 负责人/PM | 方案计划 | 方案实际 | … | 验收计划 | 验收实际 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| XX项目 | P001 | 张三/李四 | 2026-08-01 | 2026-07-30 | … | 2026-12-30 | |

- 表头自动识别；日期支持 `2026-08-01`、`2026/8/1`、`2026年8月1日`、Excel 序列号
- 导入模式：**按名称更新**（推荐）或**清空后导入**（危险）
- 系统同时提供「下载当前数据模板」导出

## 目录结构

```
├── prisma/                 # 数据模型与种子数据
├── src/
│   ├── app/                # 页面与 API 路由（App Router）
│   │   ├── api/            # REST API（鉴权/项目/导入/周报/管理）
│   │   ├── login/          # 登录
│   │   ├── projects/       # 项目列表 / 新建 / 详情
│   │   ├── weekly/         # 周报提交 / 汇总合并
│   │   ├── reminders/      # 到期提醒
│   │   └── admin/          # 用户管理 / 审计日志
│   ├── components/         # 共享组件（表单/表格/徽章）
│   ├── lib/                # 核心逻辑（鉴权/状态引擎/Excel/审计）
│   └── middleware.ts       # 路由级鉴权
├── tests/                  # 验收规则自动化测试
├── docs/                   # 部署与验收文档
└── Dockerfile / docker-compose.yml
```

## 部署

详见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)，支持：

1. Docker Compose（本机/内网/NAS）
2. 云主机（Docker 单容器）
3. 群晖/威联通 NAS
4. CloudBase 云托管（CodeBuddy 内置部署）
