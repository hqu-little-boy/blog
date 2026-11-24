---
author: hqu-little-boy
pubDatetime: 2026-11-23T10:09:00Z
title: 设计模式沉思录（第10讲）：原型模式（Prototype Pattern）
featured: false
draft: false
tags:
  - 设计模式
  - C++
  - 面向对象
  - 架构设计
description: 通过克隆已有对象原型创建新对象，适用于深拷贝与探索式运行时状态快照。
---

# 设计模式沉思录（第10讲）：原型模式（Prototype Pattern）

> [!NOTE] 专栏导读
> 本文是 **《侯捷 C++ 设计模式沉思录》** 系列专栏的第 **10** 讲。
> - **上一讲**：[上一讲：第09讲 抽象工厂模式（Abstract Factory Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-09-abstract-factory.md)
> - **下一讲**：[下一讲：第11讲 构建器模式（Builder Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-11-builder.md)
> - **架构进阶**：[异构计算与 AI 编译器设计模式全景实践指南](file:///home/ubuntu/git/blog/src/content/posts/heterogeneous-computing-and-ai-compiler-design-patterns-guide.md)


## 一、模式定义

原型模式是一种创建型设计模式，它通过**克隆（clone）**已有对象来创建新对象，而不是通过 `new` 来构造。

## 二、解决的问题

原型模式解决的问题与工厂方法模式（Factory Method）**完全一致**——都是为了**隔离对象的使用者与具体类型之间的耦合关系**，即解决 `new` 的问题。

但原型模式有一个**关键区别**：它专门针对**结构复杂的对象**。

### 何时使用原型模式 vs 工厂方法模式？

| 场景 | 推荐模式 |
|------|----------|
| 对象创建简单，几行代码即可完成 | 工厂方法模式 |
| 对象结构复杂，初始状态难以通过参数构造 | 原型模式 |

**核心判断标准**：当对象的中间状态很重要，且用工厂方法实现非常繁琐甚至难以正确实现时，使用原型模式。

## 三、模式结构

原型模式的核心技巧：**将产品抽象类与工厂抽象类合并为一个类**。

### 与工厂方法模式的对比

**工厂方法模式**（两个抽象类）：

```
ISplitter（产品抽象类）        ISplitterFactory（工厂抽象类）
    ↑                              ↑
BinarySplitter               BinarySplitterFactory
TxtSplitter                  TxtSplitterFactory
```

**原型模式**（合并为一个类）：

```
ISplitter（既是产品，又是原型）
├── clone() = 0;
├── split() = 0;
    ↑
BinarySplitter（实现 clone 和业务方法）
TxtSplitter（实现 clone 和业务方法）
```

### 类图

```
┌─────────────────┐
│  ISplitter      │  ← 抽象原型类
│─────────────────│
│ + clone()       │  ← 核心方法
│ + split()       │  ← 业务方法
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼─────┐ ┌─▼───────┐
│Binary   │ │Txt      │  ← 具体原型类
│Splitter │ │Splitter │
│─────────│ │─────────│
│+clone() │ │+clone() │  ← 返回 new XxxSplitter(*this)
│+split() │ │+split() │
└─────────┘ └─────────┘

┌──────────┐
│MainForm  │  ← 客户端
│──────────│
│-prototype│  ← 持有原型对象（仅用于克隆）
│+onClick()│
└──────────┘
```

## 四、核心实现要点

### 1. clone() 方法的实现

在 C++ 中，`clone()` 方法通过**拷贝构造函数**实现：

```cpp
class ISplitter {
public:
    virtual ~ISplitter() = default;
    virtual ISplitter* clone() const = 0;  // 原型接口
    virtual void split() = 0;              // 业务接口
};

class BinarySplitter : public ISplitter {
private:
    std::string filePath_;
    int bufferSize_;

public:
    BinarySplitter(const std::string& filePath, int bufferSize)
        : filePath_(filePath), bufferSize_(bufferSize) {}

    // 拷贝构造函数（深拷贝）
    BinarySplitter(const BinarySplitter& other)
        : filePath_(other.filePath_), bufferSize_(other.bufferSize_) {}

    // clone：调用拷贝构造函数
    ISplitter* clone() const override {
        return new BinarySplitter(*this);
    }

    void split() override {
        std::cout << "Splitting: " << filePath_ << std::endl;
    }
};
```

### 2. 客户端使用方式

```cpp
class MainForm {
private:
    ISplitter* prototype_;  // 原型对象，仅用于克隆

public:
    MainForm(ISplitter* prototype) : prototype_(prototype) {}

    void onButtonClick() {
        // 每次需要时，通过克隆原型创建新对象
        ISplitter* splitter = prototype_->clone();
        splitter->split();
        delete splitter;
    }
};

// 使用
ISplitter* prototype = new BinarySplitter("/data/file.bin", 4096);
MainForm form(prototype);
form.onButtonClick();  // 克隆出新对象使用
```

### 3. 关键原则

- **原型对象不能直接使用**，只能用于克隆
- 每次需要新对象时，调用 `clone()` 创建
- 克隆必须是**深拷贝**（deep copy），不能是浅拷贝

## 五、深克隆 vs 浅克隆

这是原型模式中最容易出错的地方。

### 浅克隆（Shallow Copy）

- 只复制指针值，不复制指针指向的数据
- 两个对象共享同一块内存
- 问题：
  1. 修改一个对象会影响另一个
  2. 一个对象析构后，另一个变成野指针
  3. 两个对象析构时 double-free 崩溃

### 深克隆（Deep Copy）

- 复制指针指向的数据，创建独立的内存副本
- 两个对象完全独立，互不影响

### C++ 中如何保证深克隆

正确实现**拷贝构造函数**即可：

```cpp
// 浅拷贝（危险！）
ShallowClone(const ShallowClone& other)
    : data_(other.data_) {}  // 只复制了指针

// 深拷贝（正确）
DeepClone(const DeepClone& other) {
    data_ = new char[strlen(other.data_) + 1];  // 分配新内存
    strcpy(data_, other.data_);                   // 复制数据
}
```

## 六、原型模式的灵活性

原型模式的一个重要优势：**原型对象可以随时替换**。

```cpp
// 初始原型
ISplitter* prototype = new BinarySplitter("/data/file.bin", 4096);
MainForm form(prototype);

// 随时可以替换原型
delete prototype;
prototype = new TxtSplitter("/data/log.csv", ',');
// 后续克隆的对象就变成了 TxtSplitter
```

这比工厂方法模式更灵活——工厂方法需要创建新的工厂对象，而原型模式只需要替换原型。

## 七、C++ 中的原型模式优势

在 C++ 中，原型模式有一个天然优势：**拷贝构造函数是语言标配**。

- C++：直接用拷贝构造函数实现 `clone()`，简单可靠
- Java/C#：没有拷贝构造函数，通常需要借助序列化/反序列化来实现深克隆，或者手动实现 `clone()` 方法

## 八、完整示例代码

### 示例 1：原型模式基本结构

```cpp
#include <iostream>
#include <string>

// 抽象原型类
class ISplitter {
public:
    virtual ~ISplitter() = default;
    virtual ISplitter* clone() const = 0;
    virtual void split() = 0;
};

// 具体原型类
class BinarySplitter : public ISplitter {
private:
    std::string filePath_;
    int bufferSize_;

public:
    BinarySplitter(const std::string& filePath, int bufferSize)
        : filePath_(filePath), bufferSize_(bufferSize) {}

    BinarySplitter(const BinarySplitter& other)
        : filePath_(other.filePath_), bufferSize_(other.bufferSize_) {}

    ISplitter* clone() const override {
        return new BinarySplitter(*this);
    }

    void split() override {
        std::cout << "BinarySplitter: splitting '" << filePath_
                  << "', buffer=" << bufferSize_ << std::endl;
    }
};

class TxtSplitter : public ISplitter {
private:
    std::string filePath_;
    char delimiter_;

public:
    TxtSplitter(const std::string& filePath, char delimiter)
        : filePath_(filePath), delimiter_(delimiter) {}

    TxtSplitter(const TxtSplitter& other)
        : filePath_(other.filePath_), delimiter_(other.delimiter_) {}

    ISplitter* clone() const override {
        return new TxtSplitter(*this);
    }

    void split() override {
        std::cout << "TxtSplitter: splitting '" << filePath_
                  << "', delimiter='" << delimiter_ << "'" << std::endl;
    }
};

// 客户端
class MainForm {
private:
    ISplitter* prototype_;

public:
    MainForm(ISplitter* prototype) : prototype_(prototype) {}

    void onButtonClick() {
        ISplitter* splitter = prototype_->clone();
        splitter->split();
        delete splitter;
    }
};

int main() {
    ISplitter* prototype = new BinarySplitter("/data/large_file.bin", 4096);
    MainForm form(prototype);

    form.onButtonClick();
    form.onButtonClick();
    form.onButtonClick();

    delete prototype;
    return 0;
}
```

### 示例 2：工厂方法 vs 原型模式对比

```cpp
#include <iostream>
#include <string>

class ISplitter {
public:
    virtual ~ISplitter() = default;
    virtual void split() = 0;
    virtual void showConfig() const = 0;
};

// ---- 工厂方法方式 ----
class ISplitterFactory {
public:
    virtual ~ISplitterFactory() = default;
    virtual ISplitter* createSplitter() = 0;
};

class ComplexSplitter : public ISplitter {
    std::string fileName_;
    int bufferSize_;
    int threadCount_;
    bool enableLog_;
    std::string outputPath_;

public:
    ComplexSplitter(const std::string& f, int b, int t, bool l, const std::string& o)
        : fileName_(f), bufferSize_(b), threadCount_(t), enableLog_(l), outputPath_(o) {}

    void split() override {
        std::cout << "Processing: " << fileName_ << std::endl;
    }

    void showConfig() const override {
        std::cout << "  file=" << fileName_ << ", buf=" << bufferSize_
                  << ", threads=" << threadCount_ << ", log=" << (enableLog_ ? "on" : "off")
                  << ", out=" << outputPath_ << std::endl;
    }
};

class ComplexSplitterFactory : public ISplitterFactory {
    std::string f_; int b_; int t_; bool l_; std::string o_;

public:
    ComplexSplitterFactory(const std::string& f, int bv, int tv, bool lv, const std::string& o)
        : f_(f), b_(bv), t_(tv), l_(lv), o_(o) {}

    ISplitter* createSplitter() override {
        return new ComplexSplitter(f_, b_, t_, l_, o_);
    }
};

// ---- 原型方式 ----
class PrototypeSplitter : public ISplitter {
    std::string fileName_;
    int bufferSize_;
    int threadCount_;
    bool enableLog_;
    std::string outputPath_;

public:
    PrototypeSplitter(const std::string& f, int b, int t, bool l, const std::string& o)
        : fileName_(f), bufferSize_(b), threadCount_(t), enableLog_(l), outputPath_(o) {}

    PrototypeSplitter(const PrototypeSplitter& other)
        : fileName_(other.fileName_), bufferSize_(other.bufferSize_),
          threadCount_(other.threadCount_), enableLog_(other.enableLog_),
          outputPath_(other.outputPath_) {}

    PrototypeSplitter* clone() const {
        return new PrototypeSplitter(*this);
    }

    void split() override {
        std::cout << "Processing: " << fileName_ << std::endl;
    }

    void showConfig() const override {
        std::cout << "  file=" << fileName_ << ", buf=" << bufferSize_
                  << ", threads=" << threadCount_ << ", log=" << (enableLog_ ? "on" : "off")
                  << ", out=" << outputPath_ << std::endl;
    }
};

int main() {
    // 工厂方法：需要传递所有参数
    ComplexSplitterFactory factory("data.bin", 4096, 4, true, "/output/");
    ISplitter* s1 = factory.createSplitter();
    s1->showConfig();
    delete s1;

    // 原型模式：配置一次，克隆多次
    PrototypeSplitter* prototype = new PrototypeSplitter("data.bin", 4096, 4, true, "/output/");
    PrototypeSplitter* s2 = prototype->clone();
    s2->showConfig();
    delete s2;
    delete prototype;

    return 0;
}
```

## 九、总结

| 特性 | 说明 |
|------|------|
| 模式类型 | 创建型模式 |
| 核心思想 | 通过克隆已有对象来创建新对象 |
| 解决的问题 | 与工厂方法相同（隔离 `new`），但针对复杂对象 |
| 关键实现 | `clone()` 方法 + 拷贝构造函数（深拷贝） |
| 使用场景 | 对象结构复杂，初始状态难以通过参数构造 |
| 使用频率 | 相对较少，但在复杂对象创建场景中很有价值 |
| C++ 优势 | 拷贝构造函数是语言标配，实现 clone 非常方便 |
| 注意事项 | 必须是深克隆，原型对象不能直接使用 |

## 十、与其他模式的关系

- **工厂方法模式**：原型模式是工厂方法的变体，解决同样的问题，但用克隆代替 `new`
- **抽象工厂模式**：都可以创建一族对象，但原型模式更灵活
- **备忘录模式**：都涉及对象状态的保存，但目的不同


---

## 专栏导航与全景索引

- [上一讲：第09讲 抽象工厂模式（Abstract Factory Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-09-abstract-factory.md)
- [下一讲：第11讲 构建器模式（Builder Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-11-builder.md)
- 架构进阶：[异构计算与 AI 编译器设计模式全景实践指南](file:///home/ubuntu/git/blog/src/content/posts/heterogeneous-computing-and-ai-compiler-design-patterns-guide.md)
