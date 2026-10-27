---
author: hqu-little-boy
pubDatetime: 2026-10-26T12:00:00Z
title: 欢迎来到我的博客：基于 Astro 与 Material Design 3 的新起点
featured: true
draft: false
tags:
  - 随笔
  - 博客
  - 指南
description: 这是博客的第一篇文章。基于 AstroPaper 骨架与 Google Material Design 3 极简灵动美学打造，连接 GitHub 与 Cloudflare Pages 实现全自动文章发布。
---

欢迎来到我的博客！

本博客采用 **Astro 框架** 驱动，视觉上融合了 **AstroPaper 的极简文字骨架** 与 **Google Material Design 3 (M3) 的柔和色调、大圆角与物理缓动**，呈现出一种「极简克制中的灵动」。

---

## 🚀 它是如何工作的？

这是一个纯粹的 **GitOps / Jamstack 自动化博客**。你不需要进入任何后台管理系统，日常写文章只需要与 GitHub 交互：

1. **写文章**：在 `src/content/posts/` 目录下新增一个 `.md` 或 `.mdx` 文件。
2. **提交与推送**：执行 `git push`（或者直接在 GitHub 网页端点击「Add file -> Create new file」在线编辑并提交）。
3. **自动同步与部署**：**Cloudflare Pages** 监听到仓库变动后，会自动在云端执行编译并在 1 分钟内将新文章全球分发上线。
4. **增减自如**：修改、重命名或删除对应的 Markdown 文件，线上博客的文章列表、分类标签与归档都会随之自动增减。

---

## 📝 Markdown 头部写作规范 (Frontmatter)

每篇 Markdown 文件的最顶部需要包含以下元数据：

```yaml
---
author: hqu-little-boy
pubDatetime: 2026-10-26T12:00:00Z
title: 文章标题
featured: false # 是否在首页精选展示 (true / false)
draft: false # 是否为草稿 (true 不会发布上线)
tags:
  - 技术
  - 思考
description: 文章简要描述或摘要，展示在列表卡片中。
---
```

在这段配置之后，你可以像往常一样书写标准的 Markdown 正文。

---

## ✨ 视觉与交互特色 (Material Design 3)

- **有温度的表面色调（Tonal Surface）**：告别刺眼的纯白与纯黑，浅色模式采用温润柔和的纸质暖调，暗黑模式采用深度通透的暗碳色。
- **胶囊药丸与柔和圆角（Pill Chips & Rounded Corners）**：标签与卡片均经过精致弧度微调，克制而不呆板。
- **平滑物理缓动（Emphasized Easing）**：卡片悬浮、按钮点击与暗黑模式切换均带有 Google M3 标准物理加速度，触感细腻。
- **原生平滑翻页（View Transitions）**：文章与列表跳转无需重新加载白屏，如同原生应用般丝滑流畅。

开始享受纯粹的文字与创作吧！
