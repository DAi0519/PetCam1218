# PET CAM — Xmas Edition

给你的宠物拍一张圣诞大片。上传照片，AI 自动生成节日风格的写真。

## 玩法

上传宠物照片后，有两种模式可选：

- **Pet Portrait** — AI 分析宠物特征，搭配圣诞服饰和场景道具，生成一张杂志风格的圣诞写真
- **Hat Only** — 保留原图风格，只给主体加一顶圣诞帽

非宠物照片也可以用，会自动降级到加帽模式。

## 技术

React + TypeScript 前端，Hono 后端，Poe API 上的 GPT-Image-2 负责图像编辑与生成。

## Cloudflare 部署

项目现在已经切到 Cloudflare Workers 的全栈结构：

- 前端静态资源由 Vite 构建，交给 Workers Assets 提供
- `/api/public/gemini/generate` 和 `/api/public/admin/ban` 由 Hono Worker 处理
- `D1` 存生成记录和封禁状态
- `R2` 可选，用于持久化生成后的图片
- `Secrets` 存 `POE_API_KEY` 和 `ADMIN_SECRET`

### 本地开发

1. 安装依赖

```sh
npm install
```

2. 生成 Worker 类型

```sh
npm run cf-typegen
```

3. 配置本地 secrets

从示例复制：

```sh
cp .dev.vars.example .dev.vars
```

再把真实值填进去。

4. 初始化本地 D1 数据库

```sh
npm run cf:migrate:local
```

5. 启动开发环境

```sh
npm run dev
```

`npm run dev` 也会在启动前自动补一次本地迁移；如果你改了 SQL schema，重新运行一次 `npm run cf:migrate:local` 即可。

### Cloudflare 资源准备

1. 登录 Cloudflare

```sh
npx wrangler login
```

2. 一键创建 D1，并在账号已开通 R2 时自动创建 R2 绑定

```sh
npm run cf:bootstrap
```

3. 执行初始化 SQL

```sh
npm run cf:migrate:remote
```

4. 准备并上传生产 secrets

```sh
cp cloudflare/secrets.production.example.env cloudflare/secrets.production.env
npm run cf:secrets:bulk
```

5. 可选：部署前检查

```sh
npm run cf:verify
```

### 部署

```sh
npm run deploy
```

### 可选前端变量

- `VITE_API_BASE_URL`

默认留空，前端会请求同域 `/api/...`。只有当前后端拆域部署时才需要设置它。

### 关于 R2

如果 Cloudflare 账号尚未开通 R2，项目仍然可以部署和生成图片，只是生成结果不会额外持久化到对象存储，数据库中的 `image_uri` 会保持为空。
