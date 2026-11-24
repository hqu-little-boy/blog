---
author: hqu-little-boy
pubDatetime: 2026-11-23T10:19:00Z
title: 设计模式沉思录（第20讲）：组合模式（Composite Pattern）
featured: false
draft: false
tags:
  - 设计模式
  - C++
  - 面向对象
  - 架构设计
description: 将对象组织为树形层次结构，让客户端对单个叶子对象与组合容器拥有完全一致的操作体验。
---

# 设计模式沉思录（第20讲）：组合模式（Composite Pattern）

> [!NOTE] 专栏导读
> 本文是 **《侯捷 C++ 设计模式沉思录》** 系列专栏的第 **20** 讲。
> - **上一讲**：[上一讲：第19讲 备忘录模式（Memento Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-19-memento.md)
> - **下一讲**：[下一讲：第21讲 迭代器模式（Iterator Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-21-iterator.md)
> - **架构进阶**：[异构计算与 AI 编译器设计模式全景实践指南](file:///home/ubuntu/git/blog/src/content/posts/heterogeneous-computing-and-ai-compiler-design-patterns-guide.md)


## 1. 模式分类：数据结构模式

Composite（组合）模式与 Iterator（迭代器）模式、Chain of Responsibility（职责链）模式同属于**数据结构模式**。

将这些模式归为数据结构模式的原因：在组件内部常常存在特定的数据结构，如果让外部代码依赖这些内部数据结构，就会破坏组件的复用性。从变化的角度来看，如果能将特定数据结构封装在组件内部，对外提供一致的接口，实现与特定数据结构无关的访问，就能更好地实现复用性。

## 2. 问题背景

如果客户代码过多地依赖对象容器内部的复杂结构，那么当容器内部实现结构发生变化时，外部代码也必须跟着修改，这不利于系统的复用性、维护性和扩展性。

## 3. Composite 模式的核心思想

> **将对象组合成树形结构以表示"部分-整体"的层次结构。Composite 使得用户对单个对象和组合对象的使用具有一致性。**

**一致性的含义**：客户代码对单个对象（叶子节点）和组合对象（容器节点/树节点）采用完全相同的处理方式，无需区分它们的具体类型。

## 4. 模式结构

### 4.1 类图

```
        ┌──────────────────────┐
        │     Component        │  ← 抽象基类
        │──────────────────────│
        │ + process() = 0      │  ← 统一接口（纯虚函数）
        │ + getName()          │
        └──────────┬───────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
┌────────┴────────┐  ┌───────┴────────┐
│     Leaf        │  │   Composite    │  ← 两个子类
│─────────────────│  │────────────────│
│ - name_         │  │ - name_        │
│                 │  │ - children_    │  ← 持有子节点列表
│ + process()     │  │                │    （类型为 Component*）
│                 │  │ + add()        │
│                 │  │ + remove()     │
│                 │  │ + process()    │  ← 关键：多态递归
└─────────────────┘  └────────────────┘
```

### 4.2 角色说明

| 角色 | 说明 |
|------|------|
| **Component** | 为组合中的对象声明统一接口，定义了叶子和容器的公共行为 |
| **Leaf** | 叶子节点，没有子节点，实现 Component 接口的具体行为 |
| **Composite** | 容器/树节点，含有子节点列表，子节点类型为 Component（多态容器），实现 Component 接口并在其中递归调用子节点的接口 |

## 5. 核心机制：多态递归调用

Composite 模式的核心在于 `process()` 方法中的**多态递归调用**：

```cpp
// Composite::process()
void process(int depth = 0) const override {
    // 第一步：处理当前节点自身的逻辑
    std::cout << "[Composite] " << name_ << std::endl;

    // 第二步：遍历所有子节点，多态调用 process()
    for (const auto& child : children_) {
        child->process(depth + 1);  // 虚函数调用
        // 如果 child 是 Composite → 递归调用 Composite::process()
        // 如果 child 是 Leaf → 调用 Leaf::process()，不再递归
    }
}
```

这种**多态的递归调用**将树形结构的遍历封装在了组合对象的内部，客户代码无需了解内部数据结构。

## 6. 将一对多关系转化为一对一关系

如果不使用 Composite 模式，客户代码需要：

- 判断当前对象是叶子节点还是容器节点
- 如果是容器节点，需要取出子元素逐一处理（**一对多**）
- 如果是叶子节点，直接处理（**一对一**）
- 必须暴露内部数据结构

使用 Composite 模式后：

- 客户代码只调用统一的 `process()` 接口（**一对一**）
- 内部的递归遍历由 Composite 自行处理
- 客户代码与纯粹的抽象基类发生依赖

## 7. 设计决策：add/remove 的放置位置

关于 `add()` 和 `remove()` 方法放在哪个类中，存在争议：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 放在 **Component** 基类中 | 调用方无需判断类型 | Leaf 节点继承了无意义的 add/remove，实现为空方法或抛异常都不理想 |
| 放在 **Composite** 子类中（推荐） | Leaf 不会暴露无意义的接口 | 调用时需要判断对象类型才能调用 add/remove |

**详细分析**：

- **放在基类的问题**：叶子节点是终端节点，不应该有添加子节点的能力。如果在 Leaf 中实现空的 add/remove（什么都不做），等于欺骗调用者；如果抛出异常，则违反了里氏替换原则（Liskov Substitution Principle）——子类应该能够替换父类，不应该拒绝实现父类定义的接口。
- **放在子类的问题**：调用方需要先判断对象类型才能决定是否可以调用 add/remove，但这是相对更合理的选择。

实际工程中，两种方案都有使用，需要根据具体场景权衡。

## 8. 完整示例代码

### 8.1 基础实现

```cpp
#include <iostream>
#include <string>
#include <vector>
#include <memory>
#include <algorithm>

// ==================== Component 抽象基类 ====================
class Component {
public:
    virtual ~Component() = default;
    virtual void process(int depth = 0) const = 0;
    virtual std::string getName() const = 0;
};

// ==================== Leaf 叶子节点 ====================
class Leaf : public Component {
    std::string name_;
public:
    explicit Leaf(const std::string& name) : name_(name) {}

    void process(int depth = 0) const override {
        std::string indent(depth * 2, ' ');
        std::cout << indent << "[Leaf] " << name_ << std::endl;
    }

    std::string getName() const override { return name_; }
};

// ==================== Composite 树节点（容器节点） ====================
class Composite : public Component {
    std::string name_;
    std::vector<std::shared_ptr<Component>> children_;

public:
    explicit Composite(const std::string& name) : name_(name) {}

    void add(const std::shared_ptr<Component>& child) {
        children_.push_back(child);
    }

    void remove(const std::shared_ptr<Component>& child) {
        children_.erase(
            std::remove(children_.begin(), children_.end(), child),
            children_.end()
        );
    }

    // 多态递归：先处理当前节点，再遍历子节点
    void process(int depth = 0) const override {
        std::string indent(depth * 2, ' ');
        std::cout << indent << "[Composite] " << name_ << std::endl;
        for (const auto& child : children_) {
            child->process(depth + 1);  // 虚函数调用，多态递归
        }
    }

    std::string getName() const override { return name_; }
};

// ==================== 客户程序 ====================
void invoke(const Component& component) {
    std::cout << "--- invoke on: " << component.getName() << " ---" << std::endl;
    component.process();  // 统一处理，一致性
    std::cout << std::endl;
}

int main() {
    auto root = std::make_shared<Composite>("Root");
    auto node1 = std::make_shared<Composite>("TreeNode1");
    auto node2 = std::make_shared<Composite>("TreeNode2");

    auto leaf1 = std::make_shared<Leaf>("Leaf1");
    auto leaf2 = std::make_shared<Leaf>("Leaf2");
    auto leaf3 = std::make_shared<Leaf>("Leaf3");

    node1->add(leaf1);
    node2->add(leaf2);
    node2->add(leaf3);

    root->add(node1);
    root->add(node2);

    // 统一接口处理：对根节点、树节点、叶子节点都是同样方式
    invoke(*root);      // 处理整棵树
    invoke(*node2);     // 处理子树
    invoke(*leaf1);     // 处理单个叶子

    return 0;
}
```

**输出**：

```
--- invoke on: Root ---
[Composite] Root
  [Composite] TreeNode1
    [Leaf] Leaf1
  [Composite] TreeNode2
    [Leaf] Leaf2
    [Leaf] Leaf3

--- invoke on: TreeNode2 ---
[Composite] TreeNode2
  [Leaf] Leaf2
  [Leaf] Leaf3

--- invoke on: Leaf1 ---
[Leaf] Leaf1
```

### 8.2 带聚合计算的示例（模拟课程演示的树结构）

```cpp
#include <iostream>
#include <string>
#include <vector>
#include <memory>
#include <algorithm>
#include <numeric>

class Component {
public:
    virtual ~Component() = default;
    virtual void process(int depth = 0) const = 0;
    virtual std::string getName() const = 0;
    virtual int getValue() const = 0;
};

class Leaf : public Component {
    std::string name_;
    int value_;
public:
    Leaf(const std::string& name, int value)
        : name_(name), value_(value) {}

    void process(int depth = 0) const override {
        std::string indent(depth * 2, ' ');
        std::cout << indent << "[Leaf] " << name_
                  << " value=" << value_ << std::endl;
    }

    std::string getName() const override { return name_; }
    int getValue() const override { return value_; }
};

class Composite : public Component {
    std::string name_;
    std::vector<std::shared_ptr<Component>> children_;

public:
    explicit Composite(const std::string& name) : name_(name) {}

    void add(const std::shared_ptr<Component>& child) {
        children_.push_back(child);
    }

    void process(int depth = 0) const override {
        std::string indent(depth * 2, ' ');
        std::cout << indent << "[Composite] " << name_
                  << " value=" << getValue() << std::endl;
        for (const auto& child : children_) {
            child->process(depth + 1);
        }
    }

    std::string getName() const override { return name_; }

    // 组合节点的值 = 所有子节点值之和（递归聚合）
    int getValue() const override {
        return std::accumulate(children_.begin(), children_.end(), 0,
            [](int sum, const std::shared_ptr<Component>& c) {
                return sum + c->getValue();
            });
    }
};

void invoke(const Component& component) {
    std::cout << "=== Processing: " << component.getName()
              << " (total value=" << component.getValue() << ") ===" << std::endl;
    component.process();
    std::cout << std::endl;
}

int main() {
    //              Root
    //            /      \
    //     TreeNode1     TreeNode3
    //        |              |
    //     TreeNode2     TreeNode4
    //        |              |
    //     Leaf1(10)      Leaf2(20)

    auto root = std::make_shared<Composite>("Root");

    auto treeNode1 = std::make_shared<Composite>("TreeNode1");
    auto treeNode2 = std::make_shared<Composite>("TreeNode2");
    auto treeNode3 = std::make_shared<Composite>("TreeNode3");
    auto treeNode4 = std::make_shared<Composite>("TreeNode4");

    auto leaf1 = std::make_shared<Leaf>("Leaf1", 10);
    auto leaf2 = std::make_shared<Leaf>("Leaf2", 20);

    treeNode2->add(leaf1);
    treeNode1->add(treeNode2);
    treeNode4->add(leaf2);
    treeNode3->add(treeNode4);
    root->add(treeNode1);
    root->add(treeNode3);

    invoke(*root);
    invoke(*treeNode3);
    invoke(*leaf1);

    return 0;
}
```

**输出**：

```
=== Processing: Root (total value=30) ===
[Composite] Root value=30
  [Composite] TreeNode1 value=10
    [Composite] TreeNode2 value=10
      [Leaf] Leaf1 value=10
  [Composite] TreeNode3 value=20
    [Composite] TreeNode4 value=20
      [Leaf] Leaf2 value=20

=== Processing: TreeNode3 (total value=20) ===
[Composite] TreeNode3 value=20
  [Composite] TreeNode4 value=20
    [Leaf] Leaf2 value=20

=== Processing: Leaf1 (total value=10) ===
[Leaf] Leaf1 value=10
```

### 8.3 对比：不使用 Composite 模式的问题

```cpp
#include <iostream>
#include <string>
#include <vector>

struct Leaf {
    std::string name;
    int value;
};

struct TreeNode {
    std::string name;
    std::vector<TreeNode*> children;  // 只能放 TreeNode
    std::vector<Leaf*> leaves;        // 分开存放叶子
};

// 客户代码需要分别处理，不具有一致性
void processNode(TreeNode* node, int depth = 0) {
    std::string indent(depth * 2, ' ');
    std::cout << indent << "[TreeNode] " << node->name << std::endl;
    for (auto* child : node->children) {
        processNode(child, depth + 1);
    }
    for (auto* leaf : node->leaves) {
        std::cout << indent << "  [Leaf] " << leaf->name
                  << " value=" << leaf->value << std::endl;
    }
    // 问题：暴露了内部数据结构（children 和 leaves 两个容器）
}

int main() {
    Leaf l1{"Leaf1", 10};
    Leaf l2{"Leaf2", 20};

    TreeNode tn2{"TreeNode2", {}, {&l1}};
    TreeNode tn4{"TreeNode4", {}, {&l2}};
    TreeNode tn1{"TreeNode1", {&tn2}, {}};
    TreeNode tn3{"TreeNode3", {&tn4}, {}};
    TreeNode root{"Root", {&tn1, &tn3}, {}};

    processNode(&root);

    // 问题：无法对叶子节点调用 processNode（参数类型不同）
    return 0;
}
```

**存在的问题**：
- 客户代码必须区分叶子节点和容器节点，分别处理
- 暴露了内部数据结构（`children` 和 `leaves` 两个容器）
- 内部结构变化时客户代码也必须修改
- 无法用统一方式处理叶子和容器

## 9. 模式总结

| 要点 | 说明 |
|------|------|
| **数据结构** | 采用树形结构来实现普遍存在的对象容器 |
| **核心转化** | 将一对多的关系转化为一对一的关系 |
| **一致性** | 客户代码可以一致地处理单个对象和组合容器，无需关心处理的是哪种 |
| **解耦** | 客户代码与纯粹的抽象基类发生依赖，与复杂对象容器结构解耦 |
| **实现关键** | 通过多态的递归调用，将树形结构的访问封装在组合对象内部 |
| **设计权衡** | add/remove 方法放在 Composite 子类中更为合理 |

## 10. 补充要点

### 10.1 适用场景

- 需要表示对象的部分-整体层次结构
- 希望用户忽略组合对象与单个对象的不同，统一地使用组合结构中的所有对象
- 文件系统（文件/文件夹）、GUI 组件树、组织架构树等

### 10.2 与其他模式的关系

- **与 Iterator 模式**：同属数据结构模式，Iterator 封装遍历，Composite 封装树形结构的访问
- **与 Chain of Responsibility 模式**：同属数据结构模式，职责链沿链传递请求，Composite 沿树递归处理
- **与 Visitor 模式**：可以在 Composite 结构上使用 Visitor 来定义新的操作而不修改节点类

### 10.3 实现细节

- 父对象和子对象之间是否需要双向引用（子对象能否找到父对象）
- 如果父对象有频繁的遍历需求，可以使用缓存技巧来改善遍历效率
- 这些属于算法层面的具体技巧，不是 Composite 模式的核心


---

## 专栏导航与全景索引

- [上一讲：第19讲 备忘录模式（Memento Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-19-memento.md)
- [下一讲：第21讲 迭代器模式（Iterator Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-21-iterator.md)
- 架构进阶：[异构计算与 AI 编译器设计模式全景实践指南](file:///home/ubuntu/git/blog/src/content/posts/heterogeneous-computing-and-ai-compiler-design-patterns-guide.md)
