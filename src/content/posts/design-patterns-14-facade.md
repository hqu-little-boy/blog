---
author: hqu-little-boy
pubDatetime: 2026-11-23T10:13:00Z
title: 设计模式沉思录（第14讲）：门面模式（Facade Pattern）
featured: false
draft: false
tags:
  - 设计模式
  - C++
  - 面向对象
  - 架构设计
description: 为庞大复杂的底层子系统提供简洁高层的统一接口，防范上帝对象反模式。
---

# 设计模式沉思录（第14讲）：门面模式（Facade Pattern）

> [!NOTE] 专栏导读
> 本文是 **《侯捷 C++ 设计模式沉思录》** 系列专栏的第 **14** 讲。
> - **上一讲**：[上一讲：第13讲 享元模式（Flyweight Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-13-flyweight.md)
> - **下一讲**：[下一讲：第15讲 代理模式（Proxy Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-15-proxy.md)
> - **架构进阶**：[异构计算与 AI 编译器设计模式全景实践指南](file:///home/ubuntu/git/blog/src/content/posts/heterogeneous-computing-and-ai-compiler-design-patterns-guide.md)


## 1. 模式分类

门面模式（Facade）属于**接口隔离模式**，同属该类别的还有：

- **Proxy**（代理模式）
- **Adapter**（适配器模式）
- **Mediator**（中介者模式）

这四个模式的共同特征：通过引入**间接层**来隔离接口依赖，降低系统耦合。

## 2. 核心设计思想：间接（Indirection）

> 间接是软件设计的核心关键词之一。—— 某软件界大师

间接思想贯穿整个软件发展史：

| 层次 | 间接关系 | 说明 |
|------|----------|------|
| 硬件 → 软件 | 软件是硬件的间接层 | 人通过软件控制硬件，而非直接操作硬件 |
| 软件 → 操作系统 | OS 是软硬件之间的间接层 | 将进程管理、内存管理、资源管理等稳定部分剥离出来 |
| OS → 中间件/虚拟机 | 中间件是 OS 与应用之间的间接层 | 如 Java 虚拟机（JVM）、.NET CLR |

**本质**：间接思想的核心是**稳定与变化的剥离** —— 将相对稳定的部分提取为间接层，让变化频度高的部分与之解耦。

设计模式中已多次体现间接思想：

- **依赖倒置原则（DIP）**：A 依赖 B → A 依赖接口 IB，B 实现接口 IB
- **门面模式**：外部客户依赖 Facade 接口，而非直接依赖子系统内部

## 3. 门面模式的问题场景

### 3.1 A 方案（无 Facade）的问题

以数据访问子系统为例，涉及多个内部对象：

- 数据库连接对象（Connection）
- 数据库命令对象（Command）
- 数据参数对象（Parameter）
- 表结构对象（Table Schema）

**问题**：如果外部客户程序直接与这些内部对象耦合，会导致：

1. **系统结构散漫**：客户与子系统内部产生过多的直接依赖关系
2. **变化传导剧烈**：当子系统内部变化时（如从 MySQL 切换到 Oracle），外部客户程序受到大面积影响

### 3.2 B 方案（使用 Facade）

引入 Facade 作为间接层：

```
┌─────────────────────────────────────────────────┐
│                 外部客户程序                       │
│                                                   │
│         只与 Facade 接口交互                       │
└────────────────────┬──────────────────────────────┘
                     │
         ┌───────────▼───────────┐
         │    Facade（门面）       │   ← 稳定的高层接口
         │   (红色: 稳定部分)      │
         └───────────┬───────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
┌───▼───┐     ┌─────▼─────┐    ┌─────▼─────┐
│Connection│    │  Command   │    │ Parameter  │   ← 内部子系统
│(蓝色:变化)│    │(蓝色:变化) │    │(蓝色:变化) │
└────────┘     └───────────┘    └───────────┘
```

- **红色部分（Facade 接口）**：稳定，与具体数据库实现无关，返回通用数据对象
- **蓝色部分（内部子系统）**：经常变化（MySQL → Oracle，连接模型变化，表结构变化等）
- **效果**：蓝色部分的变化不影响红色部分的稳定性，实现了用稳定接口隔离变化体

## 4. GoF 定义

> 为子系统中的一组接口提供一个**一致的界面**（稳定的接口），Facade 模式定义了一个高层接口，这个接口使得子系统更加**容易使用**（复用）。

关键解读：

- **一致** = 稳定：对外接口不随内部变化而改变
- **容易使用** = 复用：客户程序可以稳定地使用 Facade，无需因内部变化而修改
- 用隔离的方式将**变化**与**稳定**拆解开来

## 5. 模式特点

### 5.1 无固定代码结构

门面模式**没有特定的代码结构**，千差万别的代码结构都可能表达门面模式。它体现的是**设计原则和思想**，而非具体的代码模板。

### 5.2 架构级设计模式

门面模式更注重从**架构的层次**来看待整个系统，而非单个类的层次。它处理的是**多个类形成的系统级设计**。

### 5.3 现实世界的类比

**电脑硬件设计**就是典型的门面模式应用：

| 外部接口（稳定） | 内部组件（变化） |
|-----------------|-----------------|
| 显示器接口 | CPU（每代更新） |
| 键盘接口 | 内存条（频率/容量升级） |
| 鼠标（蓝牙） | 硬盘（HDD → SSD） |
| USB 接口 | 主板（架构迭代） |
| 电源接口 | 显卡（性能提升） |

面向用户的外部接口保持不变，内部组件在产品迭代中频繁更换。手机设计同理。

## 6. 设计原则：松耦合、高内聚

门面模式**并非一个集装箱**，不能任意往里放任何对象。

- **高内聚**：Facade 内部的子系统组件之间应有较强的关联关系（如都属于数据访问层）
- **松耦合**：Facade 对外提供稳定的接口，与外部客户解耦

**约束**：不应将无关组件放入 Facade 管辖范围。例如数据访问层的 Facade 不应包含 UI 组件（如 Button），因为它们不属于同一内聚的领域。

## 7. 模式总结

| 维度 | 说明 |
|------|------|
| **意图** | 为子系统提供统一的高层接口，简化客户与子系统的交互 |
| **效果** | 解耦：内部子系统的变化不会影响 Facade 接口 |
| **视角** | 架构级设计，关注系统级而非类级 |
| **核心** | 用稳定接口隔离变化体，实现变化与稳定的拆解 |
| **约束** | 内部组件必须高内聚（相互耦合关系大），不可随意塞入无关对象 |
| **本质** | 设计素养 / 设计修养 —— 考虑问题时需要有边界划分意识 |

## 8. 示例代码

### 8.1 示例一：数据访问层 Facade

该示例模拟了一个典型的数据访问场景：数据库访问涉及 Connection、Command、Parameter、DataReader 等多个子系统对象。Facade 将这些复杂性封装起来，对外只提供 `query()` 和 `execute()` 两个简洁接口。

当底层数据库从 MySQL 切换到 Oracle 时，只需修改 Facade 内部的实现，外部客户代码无需任何改动。

```cpp
#include <iostream>
#include <string>
#include <memory>
#include <vector>

// ============================================================
// 子系统组件: 数据库连接
// ============================================================
class DBConnection {
public:
    virtual ~DBConnection() = default;
    virtual void connect(const std::string& connectionString) = 0;
    virtual void disconnect() = 0;
    virtual std::string getConnectionInfo() const = 0;
};

class MySQLConnection : public DBConnection {
public:
    void connect(const std::string& connectionString) override {
        std::cout << "  [MySQL] 连接到: " << connectionString << std::endl;
    }
    void disconnect() override {
        std::cout << "  [MySQL] 断开连接" << std::endl;
    }
    std::string getConnectionInfo() const override {
        return "MySQL Connection";
    }
};

class OracleConnection : public DBConnection {
public:
    void connect(const std::string& connectionString) override {
        std::cout << "  [Oracle] 连接到: " << connectionString << std::endl;
    }
    void disconnect() override {
        std::cout << "  [Oracle] 断开连接" << std::endl;
    }
    std::string getConnectionInfo() const override {
        return "Oracle Connection";
    }
};

// ============================================================
// 子系统组件: 数据库命令
// ============================================================
class DBCommand {
public:
    explicit DBCommand(const std::string& sql) : sql_(sql) {}
    void execute() const {
        std::cout << "  [Command] 执行SQL: " << sql_ << std::endl;
    }
private:
    std::string sql_;
};

// ============================================================
// 子系统组件: 数据参数
// ============================================================
class DBParameter {
public:
    DBParameter(const std::string& name, const std::string& value)
        : name_(name), value_(value) {}
    std::string toString() const {
        return name_ + "=" + value_;
    }
private:
    std::string name_;
    std::string value_;
};

// ============================================================
// 子系统组件: 数据读取器
// ============================================================
class DataReader {
public:
    struct Row {
        std::vector<std::string> columns;
    };
    void addRow(const Row& row) { rows_.push_back(row); }
    const std::vector<Row>& getRows() const { return rows_; }
    void display() const {
        std::cout << "  [DataReader] 读取到 " << rows_.size() << " 行数据" << std::endl;
        for (const auto& row : rows_) {
            std::cout << "    | ";
            for (const auto& col : row.columns) {
                std::cout << col << " | ";
            }
            std::cout << std::endl;
        }
    }
private:
    std::vector<Row> rows_;
};

// ============================================================
// Facade: 数据访问门面
// 对外提供简洁的 query / execute 接口
// 内部协调 Connection, Command, Parameter, DataReader 等子系统
// ============================================================
class DataAccessFacade {
public:
    DataAccessFacade(const std::string& dbType, const std::string& connStr)
        : dbType_(dbType), connStr_(connStr) {}

    // 统一的查询接口 —— 客户无需关心连接、命令、参数等细节
    DataReader query(const std::string& sql,
                     const std::vector<DBParameter>& params = {}) {
        std::cout << "[Facade] 执行查询..." << std::endl;

        // 1. 建立连接
        auto conn = createConnection();
        conn->connect(connStr_);

        // 2. 构建并执行命令
        DBCommand cmd(sql);
        if (!params.empty()) {
            std::cout << "  [Facade] 绑定参数: ";
            for (const auto& p : params) {
                std::cout << p.toString() << " ";
            }
            std::cout << std::endl;
        }
        cmd.execute();

        // 3. 读取结果
        DataReader reader;
        reader.addRow({{"1", "Alice", "30"}});
        reader.addRow({{"2", "Bob", "25"}});
        reader.display();

        // 4. 断开连接
        conn->disconnect();
        return reader;
    }

    // 统一的更新接口
    int execute(const std::string& sql,
                const std::vector<DBParameter>& params = {}) {
        std::cout << "[Facade] 执行更新..." << std::endl;

        auto conn = createConnection();
        conn->connect(connStr_);

        DBCommand cmd(sql);
        if (!params.empty()) {
            std::cout << "  [Facade] 绑定参数: ";
            for (const auto& p : params) {
                std::cout << p.toString() << " ";
            }
            std::cout << std::endl;
        }
        cmd.execute();

        conn->disconnect();
        int affectedRows = 3; // 模拟影响行数
        std::cout << "  [Facade] 影响行数: " << affectedRows << std::endl;
        return affectedRows;
    }

private:
    std::string dbType_;
    std::string connStr_;

    std::unique_ptr<DBConnection> createConnection() {
        if (dbType_ == "mysql") {
            return std::make_unique<MySQLConnection>();
        } else {
            return std::make_unique<OracleConnection>();
        }
    }
};

int main() {
    // 客户端只需和 DataAccessFacade 打交道
    // 无需关心 Connection, Command, Parameter, DataReader 等子系统
    DataAccessFacade db("mysql", "localhost:3306/mydb");

    std::cout << std::endl;
    db.query("SELECT * FROM users WHERE age > ?",
             {{"min_age", "25"}});

    std::cout << std::endl;
    db.execute("UPDATE users SET status = ? WHERE id = ?",
               {{"status", "active"}, {"id", "1"}});

    return 0;
}
```

**运行输出**：

```
[Facade] 执行查询...
  [MySQL] 连接到: localhost:3306/mydb
  [Facade] 绑定参数: min_age=25
  [Command] 执行SQL: SELECT * FROM users WHERE age > ?
  [DataReader] 读取到 2 行数据
    | 1 | Alice | 30 |
    | 2 | Bob | 25 |
  [MySQL] 断开连接

[Facade] 执行更新...
  [MySQL] 连接到: localhost:3306/mydb
  [Facade] 绑定参数: status=active id=1
  [Command] 执行SQL: UPDATE users SET status = ? WHERE id = ?
  [MySQL] 断开连接
  [Facade] 影响行数: 3
```

### 8.2 示例二：计算机硬件 Facade

该示例模拟了电脑硬件的门面设计：电脑由 CPU、内存、硬盘、显卡等多个子系统组成，开机和关机需要按特定顺序协调这些组件。Facade 封装了这些复杂流程，对外只暴露 `powerOn()` 和 `powerOff()` 两个接口。

```cpp
#include <iostream>
#include <string>

// ============================================================
// 子系统组件
// ============================================================
class CPU {
public:
    void initialize() { std::cout << "  [CPU] 初始化处理器..." << std::endl; }
    void execute()    { std::cout << "  [CPU] 执行指令" << std::endl; }
    void shutdown()   { std::cout << "  [CPU] 关闭处理器" << std::endl; }
};

class Memory {
public:
    void load(long address) {
        std::cout << "  [Memory] 加载数据到地址 0x"
                  << std::hex << address << std::dec << std::endl;
    }
    void free() { std::cout << "  [Memory] 释放内存" << std::endl; }
};

class HardDrive {
public:
    std::string read(long sector, int size) {
        std::cout << "  [HardDrive] 读取扇区 " << sector
                  << ", 大小 " << size << " bytes" << std::endl;
        return "boot_data";
    }
    void spinDown() { std::cout << "  [HardDrive] 停止磁盘旋转" << std::endl; }
};

class GraphicsCard {
public:
    void initialize() { std::cout << "  [GPU] 初始化显卡..." << std::endl; }
    void display(const std::string& msg) {
        std::cout << "  [GPU] 显示: " << msg << std::endl;
    }
    void shutdown() { std::cout << "  [GPU] 关闭显卡" << std::endl; }
};

// ============================================================
// Facade: 计算机门面
// 对外只暴露 powerOn() 和 powerOff()
// 客户无需了解 CPU、内存、硬盘、显卡的启动顺序和协调细节
// ============================================================
class ComputerFacade {
public:
    void powerOn() {
        std::cout << "[Facade] === 开机 ===" << std::endl;
        cpu_.initialize();
        gpu_.initialize();
        auto bootData = hdd_.read(0, 1024);
        mem_.load(0x00);
        cpu_.execute();
        gpu_.display("Welcome!");
        std::cout << "[Facade] 系统启动完成" << std::endl;
    }

    void powerOff() {
        std::cout << "[Facade] === 关机 ===" << std::endl;
        mem_.free();
        hdd_.spinDown();
        gpu_.shutdown();
        cpu_.shutdown();
        std::cout << "[Facade] 系统已关闭" << std::endl;
    }

private:
    CPU          cpu_;
    Memory       mem_;
    HardDrive    hdd_;
    GraphicsCard gpu_;
};

int main() {
    // 客户端只需和 ComputerFacade 打交道
    // 无需知道 CPU/内存/硬盘/显卡 的启动和关闭顺序
    ComputerFacade pc;

    std::cout << std::endl;
    pc.powerOn();

    std::cout << std::endl;
    pc.powerOff();

    return 0;
}
```

**运行输出**：

```
[Facade] === 开机 ===
  [CPU] 初始化处理器...
  [GPU] 初始化显卡...
  [HardDrive] 读取扇区 0, 大小 1024 bytes
  [Memory] 加载数据到地址 0x0
  [CPU] 执行指令
  [GPU] 显示: Welcome!
[Facade] 系统启动完成

[Facade] === 关机 ===
  [Memory] 释放内存
  [HardDrive] 停止磁盘旋转
  [GPU] 关闭显卡
  [CPU] 关闭处理器
[Facade] 系统已关闭
```

## 9. 补充：门面模式与其他模式的对比

| 模式 | 关注点 | 与 Facade 的区别 |
|------|--------|-----------------|
| **Adapter** | 接口转换 | 将一个接口转换为客户端期望的另一个接口；Facade 是为子系统提供统一的新接口 |
| **Proxy** | 访问控制 | 控制对对象的访问（延迟加载、权限控制等）；Facade 是简化多个子系统的交互 |
| **Mediator** | 对象间通信 | 协调多个对等对象之间的交互；Facade 是单向的，客户通过 Facade 访问子系统 |
| **Bridge** | 抽象与实现分离 | 将抽象与实现分离为两个独立的层次；Facade 是对外提供简化接口 |

## 10. 适用场景

- 为复杂子系统提供简单统一的入口
- 将子系统分层，每层通过 Facade 降低层间耦合
- 当子系统内部频繁变化但需要对外保持稳定接口时
- 当客户端与子系统之间存在大量直接依赖需要解耦时


---

## 专栏导航与全景索引

- [上一讲：第13讲 享元模式（Flyweight Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-13-flyweight.md)
- [下一讲：第15讲 代理模式（Proxy Pattern）](file:///home/ubuntu/git/blog/src/content/posts/design-patterns-15-proxy.md)
- 架构进阶：[异构计算与 AI 编译器设计模式全景实践指南](file:///home/ubuntu/git/blog/src/content/posts/heterogeneous-computing-and-ai-compiler-design-patterns-guide.md)
