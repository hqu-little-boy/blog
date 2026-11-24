---
author: hqu-little-boy
pubDatetime: 2026-11-23T10:11:00Z
title: 设计模式沉思录（第12讲）：单例模式（Singleton Pattern）
featured: false
draft: false
tags:
  - 设计模式
  - C++
  - 面向对象
  - 架构设计
description: 管理进程级唯一实例与延迟加载，深入剖析双重检查锁与 C++11 局部静态变量实现。
---

# 设计模式沉思录（第12讲）：单例模式（Singleton Pattern）

> [!NOTE] 专栏导读
> 本文是 **《侯捷 C++ 设计模式沉思录》** 系列专栏的第 **12** 讲。
> - **上一讲**：[上一讲：第11讲 构建器模式（Builder Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-11-builder.md)
> - **下一讲**：[下一讲：第13讲 享元模式（Flyweight Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-13-flyweight.md)
> - **架构进阶**：[异构计算与 AI 编译器设计模式全景实践指南](file:///home/ubuntu/git/blog/src/content/posts/heterogeneous-computing-and-ai-compiler-design-patterns-guide.md)


## 一、模式概述

单件模式属于**对象性能型**设计模式。面向对象设计通过抽象（虚函数、继承等）实现了松耦合，但抽象不可避免地带来一定性能代价。在某些特殊场景下（如高并发服务器），这些代价需要谨慎处理。单件模式和享元模式（Flyweight）就是为解决此类问题而生的。

### 核心意图

> 保证一个类仅有一个实例，并提供一个该实例的全局访问点。

### 适用场景

1. **逻辑正确性要求**：某些对象在系统中只能有一个，多个实例会导致逻辑错误（如配置管理器、线程池、日志系统）。
2. **性能优化需求**：创建多个实例没有必要且会造成资源浪费（如数据库连接池、缓存管理器）。

### 设计原则

保证只有一个实例的责任在于**类的设计者**，而非使用者。设计者必须从机制上保证使用者无法创建多个实例。

---

## 二、实现演进

### 1. 基础版本（单线程环境）

将构造函数和拷贝构造函数设为 `private`，通过静态成员函数返回静态成员指针。

```cpp
#include <iostream>
#include <string>

class Singleton {
public:
    static Singleton* getInstance() {
        if (m_instance == nullptr) {
            m_instance = new Singleton();
        }
        return m_instance;
    }

    void doSomething() {
        std::cout << "Singleton working, value: " << m_value << std::endl;
    }

    void setValue(int v) { m_value = v; }

    // 禁止拷贝和赋值
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

private:
    Singleton() : m_value(0) {
        std::cout << "Singleton constructor called" << std::endl;
    }
    ~Singleton() = default;

    static Singleton* m_instance;
    int m_value;
};

Singleton* Singleton::m_instance = nullptr;

int main() {
    Singleton* s1 = Singleton::getInstance();
    s1->setValue(42);
    s1->doSomething();

    Singleton* s2 = Singleton::getInstance();
    s2->doSomething();

    std::cout << "s1 == s2: " << (s1 == s2 ? "true" : "false") << std::endl;
    return 0;
}
```

**要点**：
- 构造函数必须设为 `private`，否则编译器会自动生成默认的公有构造函数
- 同时需要删除拷贝构造函数和赋值运算符，防止通过拷贝创建新实例
- 仅适用于**单线程**环境

---

### 2. 简单加锁版本（线程安全但效率低）

通过 `std::mutex` 对整个 `getInstance()` 方法加锁。

```cpp
#include <iostream>
#include <mutex>

class Singleton {
public:
    static Singleton* getInstance() {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_instance == nullptr) {
            m_instance = new Singleton();
        }
        return m_instance;
    }

    void doSomething() {
        std::cout << "Singleton (lock version) working" << std::endl;
    }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

private:
    Singleton() {
        std::cout << "Singleton constructor called" << std::endl;
    }
    ~Singleton() = default;

    static Singleton* m_instance;
    static std::mutex m_mutex;
};

Singleton* Singleton::m_instance = nullptr;
std::mutex Singleton::m_mutex;

int main() {
    Singleton* s1 = Singleton::getInstance();
    s1->doSomething();

    Singleton* s2 = Singleton::getInstance();
    std::cout << "s1 == s2: " << (s1 == s2 ? "true" : "false") << std::endl;
    return 0;
}
```

**问题分析**：
- 正确性没有问题，但**锁的代价过高**
- 当对象已经创建完成后（`m_instance != nullptr`），每次调用 `getInstance()` 仍然需要获取锁
- 此时多个线程只是在**读取**同一个变量，读操作之间不存在竞争，加锁是不必要的
- 在高并发场景下（如 Web 服务器同时 10 万人在线），锁的等待开销会非常显著

---

### 3. 双重检查锁版本（Double-Checked Locking Pattern, DCLP）—— 有缺陷

在加锁前先检查一次，加锁后再检查一次，看似完美实则存在隐患。

```cpp
// 注意：这是一个【有缺陷】的双重检查锁实现，仅作教学演示
#include <iostream>
#include <mutex>

class Singleton {
public:
    void doSomething() { std::cout << "Singleton instance working\n"; }
    static Singleton* getInstance() {
        if (m_instance == nullptr) {                    // 第一次检查（无锁）
            std::lock_guard<std::mutex> lock(m_mutex);
            if (m_instance == nullptr) {                // 第二次检查（有锁）
                m_instance = new Singleton();
            }
        }
        return m_instance;
    }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

private:
    Singleton() {
        std::cout << "Singleton constructor called" << std::endl;
    }
    ~Singleton() = default;

    static Singleton* m_instance;
    static std::mutex m_mutex;
};

Singleton* Singleton::m_instance = nullptr;
std::mutex Singleton::m_mutex;

int main() {
    Singleton* s = Singleton::getInstance();
    s->doSomething();
    return 0;
}
```

#### 为什么需要两次检查？

- **锁前检查**：避免对象已创建后仍需加锁的性能浪费（解决效率问题）
- **锁后检查**：防止两个线程同时通过第一次检查后，都进入锁内创建对象（解决正确性问题）

#### 为什么两次检查都必不可少？

| 场景 | 只有锁前检查 | 只有锁后检查 |
|------|-------------|-------------|
| 对象已创建，多线程并发读取 | 不加锁，效率高 | 每次都加锁，效率低 |
| 两线程同时通过第一次检查 | 不适用 | 可防止重复创建 |

#### 内存重排序（Reorder）问题

这个版本**看似正确，实则在所有编译器上都会出问题**，约在 1999-2000 年被研究者发现。

`new Singleton()` 在编译器/CPU 层面实际分为三步：

```
预期顺序：
Step 1: 分配内存
Step 2: 调用构造函数（初始化内存）
Step 3: 将地址赋值给 m_instance

实际可能被重排序为：
Step 1: 分配内存
Step 2: 将地址赋值给 m_instance   ← m_instance 已非 nullptr！
Step 3: 调用构造函数               ← 但对象尚未初始化！
```

**后果**：线程 A 在执行完"分配内存 + 赋值"但尚未调用构造函数时，线程 B 通过第一次检查发现 `m_instance != nullptr`，直接返回一个**未构造完成的对象**，导致未定义行为。

---

### 4. C++11 正确的双重检查锁版本（使用 `std::atomic`）

C++11 引入了 `std::atomic` 和内存序（memory order），可以正确实现跨平台的双重检查锁。

```cpp
#include <iostream>
#include <mutex>
#include <atomic>

class Singleton {
public:
    static Singleton* getInstance() {
        Singleton* tmp = m_instance.load(std::memory_order_acquire);  // 获取语义
        if (tmp == nullptr) {
            std::lock_guard<std::mutex> lock(m_mutex);
            tmp = m_instance.load(std::memory_order_relaxed);
            if (tmp == nullptr) {
                tmp = new Singleton();
                m_instance.store(tmp, std::memory_order_release);    // 释放语义
            }
        }
        return tmp;
    }

    void doSomething() {
        std::cout << "Singleton (atomic DCLP) working, value: " << m_value << std::endl;
    }

    void setValue(int v) { m_value = v; }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

private:
    Singleton() : m_value(0) {
        std::cout << "Singleton constructor called" << std::endl;
    }
    ~Singleton() = default;

    static std::atomic<Singleton*> m_instance;
    static std::mutex m_mutex;
    int m_value;
};

std::atomic<Singleton*> Singleton::m_instance{nullptr};
std::mutex Singleton::m_mutex;

int main() {
    Singleton* s1 = Singleton::getInstance();
    s1->setValue(100);
    s1->doSomething();

    Singleton* s2 = Singleton::getInstance();
    s2->doSomething();

    std::cout << "s1 == s2: " << (s1 == s2 ? "true" : "false") << std::endl;
    return 0;
}
```

**关键机制**：
- `std::memory_order_acquire`：获取内存屏障，保证此操作之后的读写不会被重排到此操作之前
- `std::memory_order_release`：释放内存屏障，保证此操作之前的读写不会被重排到此操作之后
- 两者配合确保：当另一个线程读取到非 nullptr 的 `m_instance` 时，构造函数一定已经执行完毕

---

### 5. Meyers' Singleton（C++11 推荐方案）

利用 C++11 标准保证的**局部静态变量线程安全性**，最简洁优雅的实现。

```cpp
#include <iostream>

class Singleton {
public:
    static Singleton& getInstance() {
        static Singleton instance;  // C++11 标准保证线程安全
        return instance;
    }

    void doSomething() {
        std::cout << "Singleton (Meyers) working, value: " << m_value << std::endl;
    }

    void setValue(int v) { m_value = v; }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

private:
    Singleton() : m_value(0) {
        std::cout << "Singleton constructor called" << std::endl;
    }
    ~Singleton() = default;

    int m_value;
};

int main() {
    Singleton& s1 = Singleton::getInstance();
    s1.setValue(999);
    s1.doSomething();

    Singleton& s2 = Singleton::getInstance();
    s2.doSomething();

    std::cout << "&s1 == &s2: " << (&s1 == &s2 ? "true" : "false") << std::endl;
    return 0;
}
```

**优势**：
- 代码最简洁，无需手动管理指针和锁
- C++11 标准 [stmt.dcl] 明确保证：如果多个线程同时进入声明局部静态变量的函数，只有一个线程完成初始化，其他线程等待
- 天然线程安全，无需额外同步机制
- 对象在首次调用时构造（延迟初始化），程序结束时自动析构

---

## 三、各版本对比

| 版本 | 线程安全 | 性能 | 实现复杂度 | 推荐度 |
|------|---------|------|-----------|--------|
| 基础版本 | 否 | 最高 | 低 | 单线程可用 |
| 简单加锁 | 是 | 低（每次加锁） | 低 | 不推荐 |
| 双重检查锁（无屏障） | **否** | 高 | 中 | **禁止使用** |
| 双重检查锁（atomic） | 是 | 高 | 高 | 需要指针语义时使用 |
| Meyers' Singleton | 是 | 高 | 最低 | **C++11 首选** |

---

## 四、注意事项

1. **不要暴露克隆接口**：避免实现 `clone()` 等可能导致多个实例的方法
2. **析构函数处理**：如果需要在析构时释放资源，注意避免循环依赖
3. **继承场景**：若需要子类派生，可将构造函数设为 `protected` 而非 `private`
4. **`volatile` 关键字**：Java/C# 中使用 `volatile` 防止重排序；C++ 中 `volatile` 不提供内存序保证，应使用 `std::atomic`
5. **高并发场景**：优先使用 Meyers' Singleton 或 `std::call_once`

---

## 五、补充知识

### `std::call_once` 方案

C++11 还提供了 `std::call_once` + `std::once_flag` 作为另一种线程安全的一次性初始化机制：

```cpp
#include <iostream>
#include <mutex>

class Singleton {
public:
    static Singleton* getInstance() {
        std::call_once(m_flag, []() {
            m_instance = new Singleton();
        });
        return m_instance;
    }

    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

private:
    Singleton() {
        std::cout << "Singleton constructor called" << std::endl;
    }
    ~Singleton() = default;

    static Singleton* m_instance;
    static std::once_flag m_flag;
};

Singleton* Singleton::m_instance = nullptr;
std::once_flag Singleton::m_flag;
```

### 单件模式的争议

单件模式在现代软件工程中存在一些争议：
- **全局状态**：本质上是全局变量，增加了模块间的隐式耦合
- **测试困难**：全局状态使得单元测试难以隔离
- **替代方案**：依赖注入（Dependency Injection）可以在许多场景下替代单件模式，提供更好的可测试性和灵活性

尽管如此，在确实需要全局唯一实例的场景中（如日志系统、配置管理），单件模式仍然是一个实用且被广泛采用的模式。


---

## 专栏导航与全景索引

- [上一讲：第11讲 构建器模式（Builder Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-11-builder.md)
- [下一讲：第13讲 享元模式（Flyweight Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-13-flyweight.md)
- 架构进阶：[异构计算与 AI 编译器设计模式全景实践指南](file:///home/ubuntu/git/blog/src/content/posts/heterogeneous-computing-and-ai-compiler-design-patterns-guide.md)
