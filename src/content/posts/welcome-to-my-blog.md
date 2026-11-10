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
description: 这是博客的第一篇文章。基于 AstroPaper 骨架与 Google Material Design 3 极简灵动美学打造，原生支持 Mermaid 与 Graphviz 图表渲染，全自动化 GitHub 发文。
---

欢迎来到我的博客！

本博客采用 **Astro 框架** 驱动，视觉上融合了 **AstroPaper 的极简文字骨架** 与 **Google Material Design 3 (M3) 的柔和色调、大圆角与物理缓动**，呈现出一种「极简克制中的灵动」。

---

## 🚀 它是如何工作的？

这是一个纯粹的 **GitOps / Jamstack 自动化博客**。你不需要进入任何后台管理系统，日常写文章只需要与 GitHub 交互：

1. **写文章**：在 `src/content/posts/` 目录下新增一个 `.md` 或 `.mdx` 文件。
2. **提交与推送**：执行 `git push`（或者直接在 GitHub 网页端在线编辑提交）。
3. **自动同步与部署**：**Cloudflare Pages** 监听到仓库变动后，会自动在云端执行编译并在 1 分钟内将新文章全球分发上线。
4. **增减自如**：修改、重命名或删除对应的 Markdown 文件，线上博客的文章列表、分类标签与归档都会随之自动增减。

下面是使用 Markdown 内嵌 **Mermaid** 代码块渲染的发布流程图：

```mermaid
flowchart LR
    A["本地或网页编写 Markdown"] --> B["Git Push 到 GitHub 仓库"]
    B --> C["Cloudflare Pages 自动 Webhook"]
    C --> D["Astro 静态编译 (SSG)"]
    D --> E["全球 CDN 边缘节点实时上线"]
```

---

## 📊 内嵌图表渲染能力

博客已完整支持在 Markdown 中直接编写图表代码，自动编译为响应式 SVG 矢量图，并与 M3 主题暗黑模式自动适配。

### 1. Mermaid 图表

只需使用 ` ```mermaid ` 代码块即可：

```mermaid
sequenceDiagram
    autonumber
    actor User as 读者
    participant Blog as Cloudflare Edge
    participant Cache as 全球缓存
    User->>Blog: 请求访问博客
    Blog->>Cache: 查询静态资产
    Cache-->>User: 毫秒级极速返回 (HTML/CSS)
```

### 2. Graphviz (DOT 语言) 图表

使用 ` ```graphviz ` 或 ` ```dot ` 代码块，编译时直接转为高质量 SVG：

```graphviz
digraph Architecture {
    rankdir=LR;
    node [shape=box, style=rounded];

    Markdown -> Astro [label="解析 & 渲染"];
    Astro -> HTML [label="静态输出"];
    Astro -> Pagefind [label="生成全文检索"];
    HTML -> Cloudflare [label="边缘分发"];
}
```

---

## 💻 浏览器内直接执行代码 (100% 客户端本地算力)

本博客已全面升级为**可交互技术实验室**！依托 **Pyodide (WebAssembly CPython)** 与 **浏览器本地 WebAssembly / 算法沙箱**，所有代码的词法解析、解释执行与标准输出**100% 运行在读者本地设备的浏览器中**（消耗的是访问者本人的 CPU 算力，零后端服务器依赖与通信）：

- **零服务端负载**：完全脱离云端容器与后端编译集群，代码不会被发送到任何第三方服务器。
- **可交互调参**：在阅读技术文章时，不仅能一键运行代码，还可以在控制台中点击 **「✏️ 编辑代码」**，直接在页面中**修改参数重新运行**，直观观察算法表现与硬件模拟变化！
- **一键重置恢复**：试验完毕后点击 **「↺ 恢复」** 即可瞬间还原作者原始代码。

### 1. Python 示例 (基于 Pyodide WebAssembly 本地执行)
点击右上角的 **「▶ 运行 (Pyodide)」** 即可在浏览器本地即时执行 Python 代码；点击控制台中的 **「✏️ 编辑代码」** 还可以修改数组内容再次验证输出：

```python file="quick_sort.py"
def quick_sort(arr: list[int]) -> list[int]:
    """快速排序算法演示"""
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quick_sort(left) + middle + quick_sort(right)

if __name__ == "__main__":
    test_data = [42, 17, 93, 8, 25, 66, 1, 99]
    print(f"原数组: {test_data}")
    print(f"排序后: {quick_sort(test_data)}")
```

### 2. C++ 示例 (基于 Emscripten / C++20 沙箱)
针对底层系统、硬件体系结构与算法模拟，点击右上角 **「▶ 运行 (C/C++)」** 即可瞬间查看编译与运行输出：

```cpp file="bank_conflict_demo.cpp"
#include <iostream>
#include <vector>
#include <numeric>

// 体系结构 Bank 访存冲突模拟
int main() {
    constexpr int NUM_BANKS = 32;
    int test_strides[] = {1, 2, 4, 8, 16, 32};

    std::cout << "=== 硬件 32-Bank 访存冲突模拟 ===" << std::endl;
    for (int stride : test_strides) {
        int conflict_degree = std::gcd(stride, NUM_BANKS);
        double effective_bandwidth = 100.0 / conflict_degree;
        std::cout << "步长 (Stride): " << stride 
                  << " -> 冲突度: " << conflict_degree << "-way"
                  << " | 有效带宽: " << effective_bandwidth << "%" << std::endl;
    }
    return 0;
}
```

```typescript
// 支持 TypeScript 与现代语言特性
interface PostMeta {
  title: string;
  pubDatetime: Date;
  tags: string[];
}

export function formatPost(post: PostMeta): string {
  return `[${post.pubDatetime.toLocaleDateString()}] ${post.title}`;
}
```

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
  - 随笔
description: 文章简要描述或摘要，展示在列表卡片中。
---
```

在这段配置之后，你可以像往常一样书写标准的 Markdown 正文。开始享受纯粹的文字与创作吧！
