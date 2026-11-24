---
author: hqu-little-boy
pubDatetime: 2026-11-23T10:21:00Z
title: 设计模式沉思录（第22讲）：职责链模式（Chain of Responsibility）
featured: false
draft: false
tags:
  - 设计模式
  - C++
  - 面向对象
  - 架构设计
description: 将请求沿着处理链条逐级传递，实现发送者与接收者解耦及平滑降级执行。
---

# 设计模式沉思录（第22讲）：职责链模式（Chain of Responsibility）

> [!NOTE] 专栏导读
> 本文是 **《侯捷 C++ 设计模式沉思录》** 系列专栏的第 **22** 讲。
> - **上一讲**：[上一讲：第21讲 迭代器模式（Iterator Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-21-iterator.md)
> - **下一讲**：[下一讲：第23讲 命令模式（Command Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-23-command.md)
> - **架构进阶**：[异构计算与 AI 编译器设计模式全景实践指南](file:///home/ubuntu/git/blog/src/content/posts/heterogeneous-computing-and-ai-compiler-design-patterns-guide.md)


## 一、模式概述

职责链模式属于 **GoF（Gang of Four）设计模式** 中的**行为型模式**，也归类为**数据结构模式**（因为它具有明显的链表结构特征）。它与前面讲过的**组合模式（Composite）**和**迭代器模式（Iterator）**同属数据结构模式。

### 核心思想

使多个对象都有机会处理请求，从而避免请求的发送者和接收者之间的耦合关系。将这些对象连成一条链（本质是**单链表**），沿着这条链传递请求，直到有一个对象处理它为止。

### 解决的问题场景

在软件构建过程中，一个请求可能会被多个对象处理，但每个请求在运行时只能有一个接收者（处理者）。如果**显式指定**接收者，会带来发送者和接收者之间的**高度耦合**。

职责链模式让请求的发送者不需要指定具体接收者，而是在运行时根据链上的逻辑自动判断由哪个对象来处理。

---

## 二、经典应用场景

### 1. GUI 事件传播

在 Windows WPF、macOS（OS X）及 iOS 系统中，界面存在层级结构：

```
Window（窗口）
  └── Panel（面板）
        └── Button（按钮）
```

当用户进行鼠标点击、拖拽或触控操作时，事件会沿着对象的层级链条**逐级向上传播**：
- 如果当前层级的对象无法处理该事件，事件就继续传播给上一级
- 直到某个对象能处理它，或者到达链的末端

### 2. 审批流程

企业中的审批系统也是典型场景：
- 组长可审批小额请假/采购
- 部门经理可审批中等额度
- 总监可审批更大额度
- CEO 可审批所有请求

请求从最低级别的审批者开始传递，直到找到有权处理的审批者。

---

## 三、模式结构

### 类图

```
┌──────────────────────┐
│      Client          │
└──────────┬───────────┘
           │ sends request
           ▼
┌──────────────────────┐        ┌──────────────────────┐
│     Handler          │        │     Request          │
│──────────────────────│        │──────────────────────│
│ - successor: Handler*│◄───────│ - type               │
│──────────────────────│        │ - data ...           │
│ + handleRequest()    │        └──────────────────────┘
│ + setNext()          │
│ # canHandle()        │
│ # processRequest()   │
└──────────┬───────────┘
           │ 继承
     ┌─────┴──────┐
     ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│Handler1  │ │Handler2  │ │Handler3  │
│──────────│ │──────────│ │──────────│
│canHandle │ │canHandle │ │canHandle │
│process   │ │process   │ │process   │
└──────────┘ └──────────┘ └──────────┘
```

### 关键角色

| 角色 | 职责 |
|------|------|
| **Handler（抽象处理者）** | 定义处理请求的接口；持有指向下一个处理者的指针（形成链表） |
| **ConcreteHandler（具体处理者）** | 实现 `canHandle()` 判断能否处理，`processRequest()` 执行具体业务逻辑 |
| **Request（请求）** | 携带请求信息的对象 |

---

## 四、核心实现逻辑

职责链的处理流程可以用以下伪代码概括：

```
void handle(request) {
    if (canHandle(request))    // 运行时判断：我能处理吗？
        processRequest(request);   // 能处理就处理
    else if (next != nullptr)
        next->handle(request);     // 不能处理，传给下一个节点
    else
        // 链尾：缺省机制（什么都不做，或记录日志等）
}
```

**三个关键点：**

1. **链表结构**：Handler 基类持有一个指向自身的多态指针 `Handler*`，形成单向链表
2. **运行时判断**：`canHandle()` 是纯虚函数，由具体处理者在运行时决定是否能处理当前请求
3. **缺省机制**：如果请求传递到链的末端仍未被处理，应有合理的缺省处理（如记录日志、抛出异常等）

---

## 五、示例代码

### 示例 1：基本职责链（对应课程示意代码）

```cpp
#include <iostream>
#include <string>

// 请求类型枚举
enum class RequestType {
    TYPE1,
    TYPE2,
    TYPE3
};

// 请求对象：携带请求信息
class Request {
public:
    Request(RequestType type, const std::string& desc)
        : m_type(type), m_description(desc) {}

    RequestType getType() const { return m_type; }
    const std::string& getDescription() const { return m_description; }

private:
    RequestType m_type;
    std::string m_description;
};

// 抽象处理者基类
class Handler {
public:
    Handler() : m_next(nullptr) {}
    virtual ~Handler() = default;

    // 设置链表中的下一个处理者
    void setNextChain(Handler* next) { m_next = next; }

    // 处理请求的核心逻辑
    void handle(const Request& req) {
        if (canHandleRequest(req)) {
            processRequest(req);
        } else if (m_next != nullptr) {
            sendRequestToNextHandler(req);
        } else {
            std::cout << "链尾到达，无人能处理请求: "
                      << req.getDescription() << std::endl;
        }
    }

protected:
    virtual bool canHandleRequest(const Request& req) = 0;
    virtual void processRequest(const Request& req) = 0;

    void sendRequestToNextHandler(const Request& req) {
        if (m_next) m_next->handle(req);
    }

private:
    Handler* m_next;  // 指向下一个处理者，形成单链表
};

// 具体处理者1
class ConcreteHandler1 : public Handler {
protected:
    bool canHandleRequest(const Request& req) override {
        return req.getType() == RequestType::TYPE1;
    }
    void processRequest(const Request& req) override {
        std::cout << "[Handler1] 正在处理: " << req.getDescription() << std::endl;
    }
};

// 具体处理者2
class ConcreteHandler2 : public Handler {
protected:
    bool canHandleRequest(const Request& req) override {
        return req.getType() == RequestType::TYPE2;
    }
    void processRequest(const Request& req) override {
        std::cout << "[Handler2] 正在处理: " << req.getDescription() << std::endl;
    }
};

// 具体处理者3
class ConcreteHandler3 : public Handler {
protected:
    bool canHandleRequest(const Request& req) override {
        return req.getType() == RequestType::TYPE3;
    }
    void processRequest(const Request& req) override {
        std::cout << "[Handler3] 正在处理: " << req.getDescription() << std::endl;
    }
};

int main() {
    ConcreteHandler1 h1;
    ConcreteHandler2 h2;
    ConcreteHandler3 h3;

    // 组装职责链：h1 -> h2 -> h3
    h1.setNextChain(&h2);
    h2.setNextChain(&h3);

    // 从链首发送请求
    Request req1(RequestType::TYPE1, "请求类型1");
    Request req2(RequestType::TYPE2, "请求类型2");
    Request req3(RequestType::TYPE3, "请求类型3");

    h1.handle(req1);  // Handler1 处理
    h1.handle(req2);  // 传递给 Handler2 处理
    h1.handle(req3);  // 传递给 Handler3 处理

    return 0;
}
```

**输出：**
```
[Handler1] 正在处理: 请求类型1
[Handler2] 正在处理: 请求类型2
[Handler3] 正在处理: 请求类型3
```

### 示例 2：GUI 事件传播

```cpp
#include <iostream>
#include <string>

enum class EventType { MOUSE_CLICK, KEY_PRESS, DRAG };

class Event {
public:
    Event(EventType type, int x, int y) : m_type(type), m_x(x), m_y(y) {}
    EventType getType() const { return m_type; }
    int getX() const { return m_x; }
    int getY() const { return m_y; }
    std::string getTypeName() const {
        switch (m_type) {
            case EventType::MOUSE_CLICK: return "鼠标点击";
            case EventType::KEY_PRESS:   return "按键按下";
            case EventType::DRAG:        return "拖拽";
        }
        return "未知";
    }
private:
    EventType m_type;
    int m_x, m_y;
};

// 抽象 UI 组件
class UIComponent {
public:
    UIComponent(const std::string& name, int x, int y, int w, int h)
        : m_name(name), m_x(x), m_y(y), m_width(w), m_height(h), m_parent(nullptr) {}
    virtual ~UIComponent() = default;

    void setParent(UIComponent* parent) { m_parent = parent; }

    bool contains(int ex, int ey) const {
        return ex >= m_x && ex <= m_x + m_width
            && ey >= m_y && ey <= m_y + m_height;
    }

    // 职责链核心逻辑
    void handleEvent(const Event& event) {
        if (canHandle(event)) {
            processEvent(event);
        } else if (m_parent) {
            std::cout << "  [" << m_name << "] 无法处理，向上传播给 ["
                      << m_parent->m_name << "]" << std::endl;
            m_parent->handleEvent(event);
        } else {
            std::cout << "  [" << m_name << "] 已到顶层，事件未被处理" << std::endl;
        }
    }

protected:
    virtual bool canHandle(const Event& event) = 0;
    virtual void processEvent(const Event& event) = 0;
    std::string m_name;
    int m_x, m_y, m_width, m_height;
    UIComponent* m_parent;
};

class Window : public UIComponent {
public:
    Window(const std::string& n, int x, int y, int w, int h)
        : UIComponent(n, x, y, w, h) {}
protected:
    bool canHandle(const Event& e) override {
        return e.getType() == EventType::DRAG && contains(e.getX(), e.getY());
    }
    void processEvent(const Event& e) override {
        std::cout << "  [Window:" << m_name << "] 处理拖拽事件" << std::endl;
    }
};

class Panel : public UIComponent {
public:
    Panel(const std::string& n, int x, int y, int w, int h)
        : UIComponent(n, x, y, w, h) {}
protected:
    bool canHandle(const Event&) override { return false; }  // 总是向上传播
    void processEvent(const Event&) override {}
};

class Button : public UIComponent {
public:
    Button(const std::string& n, int x, int y, int w, int h)
        : UIComponent(n, x, y, w, h) {}
protected:
    bool canHandle(const Event& e) override {
        return e.getType() == EventType::MOUSE_CLICK && contains(e.getX(), e.getY());
    }
    void processEvent(const Event& e) override {
        std::cout << "  [Button:" << m_name << "] 处理鼠标点击" << std::endl;
    }
};

int main() {
    Window mainWindow("主窗口", 0, 0, 800, 600);
    Panel  settingsPanel("设置面板", 10, 10, 400, 300);
    Button okButton("确定按钮", 20, 20, 100, 40);

    // 建立父子关系（职责链）
    settingsPanel.setParent(&mainWindow);
    okButton.setParent(&settingsPanel);

    // 点击按钮区域 -> 按钮处理
    std::cout << "=== 点击确定按钮 ===" << std::endl;
    okButton.handleEvent(Event(EventType::MOUSE_CLICK, 30, 25));

    // 点击面板空白区域 -> 逐级传播到窗口，未处理
    std::cout << "\n=== 点击面板空白区域 ===" << std::endl;
    okButton.handleEvent(Event(EventType::MOUSE_CLICK, 200, 200));

    // 拖拽操作 -> 传播到窗口处理
    std::cout << "\n=== 拖拽操作 ===" << std::endl;
    okButton.handleEvent(Event(EventType::DRAG, 50, 50));

    return 0;
}
```

### 示例 3：现代 C++ 审批链（使用智能指针）

```cpp
#include <iostream>
#include <string>
#include <memory>

enum class RequestType { LEAVE, PURCHASE, BUDGET };

class Request {
public:
    Request(RequestType type, const std::string& applicant, double amount)
        : m_type(type), m_applicant(applicant), m_amount(amount) {}
    RequestType getType() const { return m_type; }
    const std::string& getApplicant() const { return m_applicant; }
    double getAmount() const { return m_amount; }
    std::string getTypeName() const {
        switch (m_type) {
            case RequestType::LEAVE:    return "请假";
            case RequestType::PURCHASE: return "采购";
            case RequestType::BUDGET:   return "预算审批";
        }
        return "未知";
    }
private:
    RequestType m_type;
    std::string m_applicant;
    double m_amount;
};

class Approver {
public:
    explicit Approver(const std::string& name) : m_name(name) {}
    virtual ~Approver() = default;

    void setNext(std::shared_ptr<Approver> next) { m_next = next; }

    void approve(const Request& req) {
        if (canApprove(req)) {
            processApproval(req);
        } else if (m_next) {
            std::cout << "  [" << m_name << "] 无权处理，转交下级" << std::endl;
            m_next->approve(req);
        } else {
            std::cout << "  [系统] 无人可审批: " << req.getApplicant()
                      << " 的 " << req.getTypeName() << " 请求被拒绝" << std::endl;
        }
    }

protected:
    virtual bool canApprove(const Request& req) = 0;
    virtual void processApproval(const Request& req) = 0;
    std::string m_name;
    std::shared_ptr<Approver> m_next;
};

class TeamLeader : public Approver {
public:
    TeamLeader() : Approver("组长") {}
protected:
    bool canApprove(const Request& req) override {
        return req.getType() == RequestType::LEAVE && req.getAmount() <= 3;
    }
    void processApproval(const Request& req) override {
        std::cout << "  [组长] 批准 " << req.getApplicant()
                  << " 的 " << req.getAmount() << " 天请假" << std::endl;
    }
};

class DepartmentManager : public Approver {
public:
    DepartmentManager() : Approver("部门经理") {}
protected:
    bool canApprove(const Request& req) override {
        if (req.getType() == RequestType::LEAVE && req.getAmount() <= 7) return true;
        if (req.getType() == RequestType::PURCHASE && req.getAmount() <= 5000) return true;
        return false;
    }
    void processApproval(const Request& req) override {
        std::cout << "  [部门经理] 批准 " << req.getApplicant()
                  << " 的 " << req.getTypeName() << " 请求" << std::endl;
    }
};

class Director : public Approver {
public:
    Director() : Approver("总监") {}
protected:
    bool canApprove(const Request& req) override {
        if (req.getType() == RequestType::LEAVE && req.getAmount() <= 30) return true;
        if (req.getType() == RequestType::PURCHASE && req.getAmount() <= 50000) return true;
        return false;
    }
    void processApproval(const Request& req) override {
        std::cout << "  [总监] 批准 " << req.getApplicant()
                  << " 的 " << req.getTypeName() << " 请求" << std::endl;
    }
};

class CEO : public Approver {
public:
    CEO() : Approver("CEO") {}
protected:
    bool canApprove(const Request&) override { return true; }
    void processApproval(const Request& req) override {
        std::cout << "  [CEO] 批准 " << req.getApplicant()
                  << " 的 " << req.getTypeName() << " 请求" << std::endl;
    }
};

int main() {
    auto leader   = std::make_shared<TeamLeader>();
    auto manager  = std::make_shared<DepartmentManager>();
    auto director = std::make_shared<Director>();
    auto ceo      = std::make_shared<CEO>();

    leader->setNext(manager);
    manager->setNext(director);
    director->setNext(ceo);

    std::cout << "=== 小王请2天假 ===" << std::endl;
    leader->approve(Request(RequestType::LEAVE, "小王", 2));

    std::cout << "\n=== 小李请5天假 ===" << std::endl;
    leader->approve(Request(RequestType::LEAVE, "小李", 5));

    std::cout << "\n=== 小张采购3000元 ===" << std::endl;
    leader->approve(Request(RequestType::PURCHASE, "小张", 3000));

    std::cout << "\n=== 小陈采购30000元 ===" << std::endl;
    leader->approve(Request(RequestType::PURCHASE, "小陈", 30000));

    return 0;
}
```

**输出：**
```
=== 小王请2天假 ===
  [组长] 批准 小王 的 2 天请假

=== 小李请5天假 ===
  [组长] 无权处理，转交下级
  [部门经理] 批准 小李 的 请假 请求

=== 小张采购3000元 ===
  [组长] 无权处理，转交下级
  [部门经理] 批准 小张 的 采购 请求

=== 小陈采购30000元 ===
  [组长] 无权处理，转交下级
  [部门经理] 无权处理，转交下级
  [总监] 批准 小陈 的 采购 请求
```

---

## 六、三个数据结构模式对比

| 模式 | 数据结构特征 | 典型应用 | 当前流行度 |
|------|-------------|---------|-----------|
| **Composite（组合模式）** | 树形结构 | 文件系统、UI 组件层级、组织架构 | 较高，仍有广泛应用 |
| **Iterator（迭代器模式）** | 遍历容器内部结构 | STL 容器遍历 | 已被语言/库内置支持（如 range-based for） |
| **Chain of Responsibility（职责链）** | 单链表 | 事件传播、审批流程、中间件管道 | 较低，多被框架内置实现 |

---

## 七、模式总结

### 适用场合

- 一个请求可能有多个接收者，但最终只有一个接收者处理
- 请求的发送者和接收者之间的耦合会导致系统脆弱
- 需要在运行时动态决定由哪个对象处理请求

### 优点

- **解耦**：发送者不需要知道哪个接收者会处理请求
- **灵活性**：可以在运行时动态调整链的组成和顺序
- **单一职责**：每个处理者只关注自己能处理的请求

### 缺点

- 请求可能到达链的末端仍未被处理，需要合理的缺省机制
- 链过长时可能影响性能（需要遍历整条链）
- 调试困难，不容易观察运行时的链路传递过程

### 设计要点

1. **链表结构**是固定的组织形式（单向链表）
2. **运行时判断**是核心特征（`canHandle()` 在运行时决定）
3. **缺省机制**不可忽略（链尾应有合理的兜底处理）
4. 今天的软件开发中，职责链模式的很多场景已被框架内置（如 Servlet Filter、Express 中间件等），单独使用频率不高，但理解其思想对理解框架设计非常有帮助


---

## 专栏导航与全景索引

- [上一讲：第21讲 迭代器模式（Iterator Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-21-iterator.md)
- [下一讲：第23讲 命令模式（Command Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-23-command.md)
- 架构进阶：[异构计算与 AI 编译器设计模式全景实践指南](file:///home/ubuntu/git/blog/src/content/posts/heterogeneous-computing-and-ai-compiler-design-patterns-guide.md)
