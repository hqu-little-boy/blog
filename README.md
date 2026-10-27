# hqu-little-boy's Blog 🌿

基于 **[Astro](https://astro.build/)** 与 **[AstroPaper](https://github.com/satnaing/astro-paper)** 打造的个人极简博客，视觉上融入了 **Google Material Design 3 (M3)** 的柔和调和表面、大圆角与物理缓动。

支持与 **Cloudflare Pages** 联动，只需在 GitHub 仓库中提交或修改 Markdown 文件，即可实现全球 CDN 自动化发布与内容增减。

---

## ✨ 博客特点

- **极简与灵动**：融合文字优先的极简排版与 Google Material Design 3 现代柔和美感。
- **全自动 GitOps**：文章存放在 `src/content/posts/`，Git 提交即触发 Cloudflare 自动部署更新。
- **极致性能**：纯静态输出，秒级加载，原生暗黑模式切换与 View Transitions 丝滑转场。
- **全文检索**：集成 Pagefind 静态全文搜索，无需外部后端数据库。
- **完整 SEO 与 RSS**：自动生成 Sitemap、RSS 订阅源及 Open Graph 分享预览图。

---

## 🚀 部署到 Cloudflare Pages

只需一次性在 Cloudflare Pages 完成绑定，后续发文无需再登录 Cloudflare：

1. 打开 [Cloudflare 控制台](https://dash.cloudflare.com/)，进入 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
2. 授权并选择本仓库：`hqu-little-boy/blog`。
3. 在构建设置（Build Settings）中填写：
   - **Framework preset**：`Astro`
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`
   - **Node.js 环境变量**（如果需要设置 Node 版本）：进入 Settings -> Environment variables，添加 `NODE_VERSION` = `22`
4. 点击 **Save and Deploy**，约 1 分钟后即可完成首次上线！

---

## ✍️ 日常写博客流程

你可以在本地编写后 `git push`，也可以直接在 GitHub 网页端操作：

### 1. 新增文章
在 `src/content/posts/` 目录下创建一个新的 `.md` 文件（如 `my-new-post.md`），头部加入元数据（Frontmatter）：

```markdown
---
author: hqu-little-boy
pubDatetime: 2026-10-26T12:00:00Z
title: 文章标题
featured: false # 是否置顶/精选展示在首页
draft: false    # 是否为草稿（若为 true 则不会发布）
tags:
  - 随笔
  - 技术
description: 这里是文章摘要，展示在列表卡片上。
---

这里开始写 Markdown 正文内容...
```

### 2. 增减与删除
- **修改文章**：直接编辑对应 `.md` 文件并提交。
- **删除文章**：在仓库中删除对应的 `.md` 文件并提交，线上博客的文章页面与首页列表条目将自动下架。

---

## 💻 本地开发

如果需要在本地运行预览：

```bash
# 1. 安装依赖
npm install

# 2. 启动本地开发服务 (默认端口 http://localhost:4321)
npm run dev

# 3. 本地构建与静态检查
npm run build

# 4. 本地预览构建产物
npm run preview
```

---

## 🎨 审美与样式定制

- **配色与变量**：`src/styles/theme.css`（定义了 M3 浅色与深色模式的 Surface 色值）。
- **字体与全局样式**：`src/styles/global.css` 与 `src/styles/typography.css`。
- **卡片与标签**：`src/components/Card.astro` 与 `src/components/Tag.astro`。
- **全站信息与社交账号**：`astro-paper.config.ts`。
