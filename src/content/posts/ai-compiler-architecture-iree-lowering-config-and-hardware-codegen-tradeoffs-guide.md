---
author: hqu-little-boy
pubDatetime: 2026-11-10T14:46:51Z
title: AI 芯片编译器架构与设计代价深度剖析：从 IREE Lowering 策略解耦、SCF 控制流到专用 Dialect 的工程权衡
featured: false
draft: false
tags:
  - MLIR
  - AI编译器
  - 编译原理
  - IREE
  - NPU
  - 芯片架构
  - LLVM
description: 深度剖析自研 NPU 与通用硬件加速器在 AI 编译器设计中的核心架构权衡。从 IREE 的 translation_info 与 lowering_config 策略解耦机制出发，系统推导计算语义、调度参数与物理硬件映射的三层分离原则；深入探讨为何不能简单用原生 scf.for/forall 替代配置属性，透彻对比 TVM、Triton、Tenstorrent 及 Arm Vela 等各厂商因硬件执行模型与工程维护成本所作出的路线抉择；并针对“连续 Pass 只产出 Attribute，最后单 Pass 一次性 Lowering”的 Plan-then-Lower 架构，从 MLIR 基础设施、中间状态验证及 Pass 稳定性等第一性原理展开深度推演与破局。
---

> **导读**：在为自定义专用加速器（如 AI NPU、DSP、张量处理器）设计编译器时，许多工程团队都会面临一系列经典的架构拷问：
>
> 1. 我们自定义的硬件描述属性（如分块尺寸、网格维度、地址发生器步长）究竟应该作为一个大包揽的属性（Attribute），还是拆解为不同层次？
> 2. 业界顶尖的工业级开源编译器 IREE（基于 MLIR 孵化）原版是如何组织其代码生成管线的？它的 `translation_info` 与 `lowering_config` 为何要大费周章地分离？
> 3. 既然 MLIR 官方早已提供了结构化控制流（`scf.for` / `scf.forall`），为什么大家不直接用原生循环操作表达分块与硬件映射，偏偏要在 IR 节点上附加五花八门的编译配置？
> 4. 为什么 TVM、Triton、Tenstorrent、Arm Vela 等厂商各走各的路，甚至自研多层方言（Dialect）？统一的开源 IR 为什么在底层硬件世界屡屡碰壁？
> 5. “在前端连续运行多个分析 Pass 仅生成 Attribute，最后由一个统一的大 Pass 一次性生成所有底层指令”，这种直觉上干净好调试的架构，在真实工程落地中到底会踩到哪些致命暗坑？
>
> 本文将从**编译第一性原理**与**工程维护生命周期**的双重视角出发，抽丝剥茧拆解上述疑问，并为芯片与 AI 编译器研发团队提供一套兼具理论高度与实战可操作性的架构设计演进指南。

---

## 零、初学者名词形象速查表 (Primer)

为了确保零基础读者或刚刚切入 AI 编译领域的软硬件开发者能够无障碍阅读，下表对本文首次出现的核心概念做出一对一的直观定义与通俗比喻：

| 术语名称                    | 英文全称 / 原型             | 核心本质与通俗比喻                                                                                                                                                     |
| :-------------------------- | :-------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IR**                      | Intermediate Representation | **编译器中间表示**。介于高级框架（如 PyTorch、ONNX）与底层芯片机器码之间的程序表示形式，相当于编译器的内部世界语。                                                     |
| **MLIR**                    | Multi-Level IR              | **多级中间表示框架**。由 LLVM 社区孵化的模块化编译器基础设施，允许开发者在同一个程序中定义和混合使用不同抽象级别的领域语言。                                           |
| **Dialect**                 | 方言                        | **MLIR 的模块化词表与命名空间**。一组相互关联的 Operation、Type 和 Attribute 的集合。例如 `arith`（标量算术）、`scf`（结构化控制流）、`linalg`（线性代数）。           |
| **Operation (Op)**          | 操作 / 指令                 | **MLIR 程序的基本执行单元**。拥有输入操作数（Operands）、输出结果（Results）、属性（Attributes）和代码块区域（Regions）。                                              |
| **Attribute (Attr)**        | 属性                        | **附着在 Operation 或类型上的编译期常量元数据**。例如矩阵分块尺寸、字典配置、字符串标识等，在编译期已知且不可变。                                                      |
| **Inherent vs Discardable** | 固有属性 vs 可丢弃属性      | **Inherent** 是 Op 定义中不可分割的语义（如 `arith.cmpi` 的谓词 `eq`）；**Discardable** 是外部附加的编译提示（如优化建议、流水线配置），丢失不会改变 Op 原始语义定义。 |
| **Tiling**                  | 循环分块 / 切片             | **高性能计算的经典空间变换技术**。将巨大的张量计算切分成适合片上 SRAM/Cache 容量的小数据块（Tile），以提升数据局部性并降低 DRAM 访问开销。                             |
| **Lowering**                | 降级 / 逐级转换             | **编译器从高抽象向低抽象翻译的过程**。例如将数学公式级别的 `linalg.matmul` 转换为循环级的 `scf.for`，再降级为汇编或机器配置。                                          |
| **Pass**                    | 编译器通道 / 变换遍         | **作用于 IR 上的独立处理单元**。一个 Pass 可以是只读的静态分析（Analysis），也可以是对 IR 进行模式匹配与重写的转换（Transformation）。                                 |
| **Pipeline**                | 流水线 / 通道链             | **一系列按序执行的 Pass 集合**。负责驱动程序从顶层模型一直编译为最终硬件可执行镜像。                                                                                   |
| **AG**                      | Address Generator           | **硬件地址生成器**。专用芯片（如 NPU）内部独立于计算核心的专用寻址硬件单元，能通过硬件循环计数器与步长寄存器，按固定模式自动吐出物理存储地址。                         |
| **SMEM / SRAM**             | Shared/Scratchpad Memory    | **芯片内部的高速片上暂存器**。读写延迟极低、带宽高，但容量有限，需由编译器或硬件精确规划管理。                                                                         |
| **DMA**                     | Direct Memory Access        | **直接内存访问控制器**。独立于 CPU/计算核心的硬件搬运工，负责在片外 DRAM 与片上 SRAM 之间批量搬运数据块。                                                              |
| **Ping-Pong Buffer**        | 双缓冲机制                  | **隐藏访存延迟的高性能并发设计**。当计算核心正在消费 Buffer A 中的数据时，DMA 控制器同时将下一轮数据搬入 Buffer B，二者交替流水作业。                                  |
| **SCF**                     | Structured Control Flow     | **MLIR 原生的结构化控制流方言**。包含 `scf.for`（有界循环）、`scf.forall`（并行分布循环）、`scf.if`（条件分支）等。                                                    |
| **Linalg**                  | Linear Algebra              | **MLIR 针对线性代数计算的核心方言**。通过结构化索引映射（Indexing Maps）与迭代器类型（Iterator Types）显式表达张量与缓冲区上的代数计算语义。                           |
| **Affine Map**              | 仿射映射                    | **MLIR 中用于表达多维坐标线性变换的代数形式**。例如 `(i, j, k) -> (i, k)` 表示从 3 维循环空间投影到 2 维张量切片空间。                                                 |
| **Root Op**                 | 根操作 / 主导操作           | **算子融合或计算分发中处于主导地位的算子**。例如在 `MatMul + Bias + ReLU` 融合块中，计算量最大且决定整体分块方案的 `MatMul` 通常被视为主导操作。                       |
| **Auto-tuning**             | 自动调优                    | **基于搜索与性能反馈的代码生成优化机制**。在合法的候选参数空间中枚举 Tile 尺寸、管线策略并测量硬件周期，从而挑出最优配置。                                             |

---

## 一、背景与问题：自研 NPU 描述属性与 IREE 的前世今生

### 1.1 典型自研 NPU 的分块属性建模

在为各类自定义硬件加速器（NPU）构建 MLIR 编译流程时，许多团队会借鉴开源先进经验，尝试设计一个高度紧凑的 Attribute 来描述矩阵分块及硬件寻址参数。以通用的 `#npu.spec` 为例：

```mlir
#input_spec = #npu.spec<
  grid = [128, 2, 1],
  index_maps = [
    affine_map<(i, j, k) -> (i, k)>,
    affine_map<(i, j, k) -> (j, k)>
  ],
  block_shapes = [
    #npu.block_shape<
      kinds = [block, block],
      extents = [16, 8],
      steps = [16, 8],
      paddings = [#npu.padding<>, #npu.padding<>]
    >,
    #npu.block_shape<
      kinds = [block, block],
      extents = [16, 8],
      steps = [16, 8],
      paddings = [#npu.padding<>, #npu.padding<>]
    >
  ]
>
```

这段结构看似简洁，实则包含了三个层面的交织意图：

1. **`grid`**：定义了逻辑计算空间的迭代范围（包含多少个逻辑 Tile 计算单元）。
2. **`index_maps`**：定义了每个逻辑计算位置应该从哪个输入张量块中提取数据。
3. **`block_shapes`**：定义了每个输入块的物理张量切片大小（`extents`）、相邻逻辑块起点的坐标跨度（`steps`）以及边界越界时的填充策略（`paddings`）。

假设这段代码服务于经典矩阵乘法：

$$C_{M \times N} = A_{M \times K} \times B^T_{K \times N}$$

其中 $M$ 方向划分为 128 个逻辑块，$N$ 方向划分为 2 个逻辑块，$K$ 方向为 1 个逻辑块（暂时不切分归约轴）。

```mermaid
flowchart TD
    subgraph Grid["逻辑三维网格空间 Grid (i, j, k)"]
        G["Grid = [128 (M), 2 (N), 1 (K)]<br/>总计 256 个逻辑计算任务"]
    end

    subgraph Affine["坐标投影映射 Index Maps"]
        M1["LHS 映射: (i, j, k) -> (i, k)"]
        M2["RHS 映射: (i, j, k) -> (j, k)"]
    end

    subgraph Blocks["切片块规约 Block Shapes"]
        B1["LHS Tile: 16 × 8<br/>Step = [16, 8]"]
        B2["RHS Tile: 16 × 8<br/>Step = [16, 8]"]
    end

    subgraph Engine["底层硬件协同执行"]
        HW["DMA 搬运至 SRAM + AG 硬件循环寻址 + 计算核心乘加"]
    end

    Grid --> M1
    Grid --> M2
    M1 --> B1
    M2 --> B2
    B1 --> HW
    B2 --> HW
```

下表梳理了该属性中的字段与底层实际物理硬件之间的映射界限：

| 属性字段     | 它直接决定的逻辑内容               | 它**不直接决定**的硬件物理事实               |
| :----------- | :--------------------------------- | :------------------------------------------- |
| `grid`       | 逻辑索引空间的广度与迭代次数       | 物理核心并发数、硬件多核流水排布             |
| `index_maps` | 逻辑迭代索引到输入张量块的代数投影 | 物理内存绝对地址、SRAM 缓存与对齐策略        |
| `extents`    | 单个逻辑数据块覆盖的行列跨度       | 硬件一次 DMA 搬运的物理字节包大小            |
| `steps`      | 相邻逻辑块起点的元素距离偏移       | SRAM 存储 Bank 跨度（Bank Stride）与物理冲突 |
| `paddings`   | 越界边界元素的数学填充规则         | DMA 硬件是否具备自动零填充能力               |

### 1.2 “大包揽”属性建模的六大隐性代价

将上述多维度信息揉合进同一个不可分割的 Attribute，对于硬件驱动开发或单算子代码生成（Codegen）可能非常直观，因为后端 Pass 能在一个地方查到所有参数。但在端到端编译器全生命周期中，这种设计将付出极其昂贵的代价：

```graphviz
digraph spec_drawbacks {
    rankdir=LR;
    node [shape=box, style="rounded,filled", fontname="sans-serif", fontsize=10];
    edge [fontname="sans-serif", fontsize=9];

    subgraph cluster_spec {
        label = "紧耦合单体 Attribute (#npu.spec)";
        style = dashed;
        color = "#e11d48";
        spec [label="Spec 属性\n(Grid + IndexMap + Tile + Steps)", fillcolor="#ffe4e6"];
    }

    p1 [label="代价 1: 过早固定分块\n优化器无法自由拆分/融合", fillcolor="#fef3c7"];
    p2 [label="代价 2: 语义验证断裂\n计算依赖与访存配置分散两处", fillcolor="#fef3c7"];
    p3 [label="代价 3: 逻辑与物理混淆\nGrid 无法映射多级硬件拓扑", fillcolor="#fef3c7"];
    p4 [label="代价 4: 特殊布局表达力受挫\n无法描述通道重排与 Bank 错位", fillcolor="#fee2e2"];
    p5 [label="代价 5: 通用 Pass 无法复用\nTilingInterface/Vectorization 失效", fillcolor="#fee2e2"];
    p6 [label="代价 6: 硬件迭代产生连带海啸\n新版 AG 架构导致全流水线推翻", fillcolor="#fee2e2"];

    spec -> p1;
    spec -> p2;
    spec -> p3;
    spec -> p4;
    spec -> p5;
    spec -> p6;
}
```

1. **过早固定分块（Premature Lowering），抹杀后续优化空间**：
   一旦在图层级固化了 `grid=[128, 2, 1]` 与 `extents=[16, 8]`，后续优化 Pass 若想将两个相邻的小块融合成一个大块以减少 DMA 启动开销，或者将其拆分为更小的切片以适应紧俏的 SRAM，就必须同步推导并修改 Grid、IndexMap、Step 和 Padding。属性一旦形成整体不可分割的元数据，重写逻辑将异常痛苦。
2. **语义分离导致正确性验证断裂**：
   `#npu.spec` 描述了“如何寻址数据”，但真正的计算逻辑（如加减乘除与规约累加）却写在随后的函数体或微内核（Microkernel）中。如果微内核里的循环将维度 $k$ 标记为归约（Reduction），而 `#npu.spec` 却将该维度误配为并行发射，编译器原生的类型系统根本无法察觉，最终在硬件上产生致命的数据覆写冲突。
3. **逻辑 Block 与物理 Hardware Block 边界混淆**：
   这里的 `grid` 到底是逻辑数学切片的空间、硬件多核并行的任务划分，还是片上 AG（地址生成器）的硬件循环计数值？在简单无冲突矩阵乘法中三者可能在数值上碰巧一致，但在引入 Ping-Pong 双缓冲、DMA 异步流水以及多核动态负载均衡时，逻辑切片绝不可能与硬件计数器一一等同。
4. **面对复杂存储布局（Layout）时抽象失控**：
   `extents + steps + affine_map` 仅适用于规则的高维矩形步进。当遇到硬件强制要求的 Channel 对齐填充、Bank 交叉存储（Interleaving）、权重离线重排（Reordering）乃至非规则稀疏寻址时，单纯的步长模型将无法承载，迫使开发者不断向属性中塞入硬件专用的补丁字段。
5. **丧失 MLIR 通用优化 Pass 复用能力**：
   上游 LLVM/MLIR 提供了极其成熟的通用基础设施，如 `TilingInterface`、`DestinationStyleOpInterface`、`VectorUnrollOpInterface`。若编译器仅依赖专有的自定义属性，通用的向量化、循环融合、跨算子切片等能力统统无法直接生效，团队不得不从零造轮子。
6. **硬件升级引发编译器代码的连带修改**：
   当代次芯片迭代导致 AG 硬件循环层数限制变化或 SRAM 访问粒度调整时，原本写在高层 IR 中的 `#npu.spec` 构造逻辑将被全部击穿，本应局限在后端 Codegen 的硬件适配工作污染了高层流水线。

---

## 二、解密 IREE 原版设计：计算语义与编译策略的彻底解耦

既然单体属性有诸多代价，开源业界最成熟的 MLIR 编译器之一 **IREE（Intermediate Representation Execution Environment）** 是如何解决这一难题的？

### 2.1 IREE 的四层架构设计模型

IREE 明确将编译系统划分为四个职责分明的层次，绝不把硬件调度策略与数学计算混合：

```mermaid
flowchart TD
    subgraph L1["第一层：纯数学计算语义 (Hardware-Agnostic)"]
        O1["linalg.matmul / linalg.generic<br/>定义数学计算、输入输出映射、Parallel/Reduction 迭代属性"]
    end

    subgraph L2["第二层：数据布局与分块计算 (Encoding & Tiling)"]
        O2["iree_encoding / iree_codegen.inner_tiled<br/>定义张量逻辑布局、内层计算原语形态"]
    end

    subgraph L3["第三层：编译与降级策略 (Lowering Strategy)"]
        O3["lowering_config / translation_info / compilation_info<br/>指定 Pipeline 选择、多级 Tile 尺寸、流水线参数 (可由调优器覆盖)"]
    end

    subgraph L4["第四层：目标机器指令实现 (Hardware-Specific Codegen)"]
        O4["LLVM CPU / GPU / 自定义 NPU 后端<br/>物化为具体硬件指令、DMA 搬运、SRAM 缓冲与事件同步"]
    end

    L1 -->|结构分析与融合| L2
    L2 -->|策略注入| L3
    L3 -->|驱动物化| L4
```

这种分层保证了核心收益：**无论目标硬件如何变化，第一层数学定义永恒不变；无论针对同一硬件采取何种分块策略，第二层计算语义不被破坏；策略仅仅是指导编译器如何进行 Lowering 的外置决策，随时可以替换或调优。**

### 2.2 剖析 `iree_codegen.inner_tiled`：计算操作与属性的本质分野

在 IREE 原版中，与自研硬件 Spec 最接近的操作是 `iree_codegen.inner_tiled`。但请注意其本质差异：**IREE 的 `inner_tiled` 是一个具有操作数与结果的 Operation，而不是附着在其他算子上的单体 Attribute！**

```mlir
%result = iree_codegen.inner_tiled
    ins(%lhs, %rhs : tensor<128x64xf16>, tensor<64x128xf16>)
    outs(%acc : tensor<128x128xf32>) <
  indexing_maps = [
    affine_map<(m, n, k) -> (m, k)>,
    affine_map<(m, n, k) -> (k, n)>,
    affine_map<(m, n, k) -> (m, n)>
  ],
  iterator_types = [
    #linalg.iterator_type<parallel>,
    #linalg.iterator_type<parallel>,
    #linalg.iterator_type<reduction>
  ],
  kind = #iree_gpu.mma_layout<MFMA_F32_16x16x16_F16>,
  semantics = #iree_gpu.mma_semantics<distributed = false>
> -> tensor<128x128xf32>
```

#### 为什么必须拥有 `iterator_types`？

这是很多自研方言容易遗漏的关键点。考虑矩阵乘法：

$$C[m, n] = \sum_k A[m, k] \times B[k, n]$$

在这个计算空间中，$m$、$n$ 和 $k$ 的物理与逻辑属性截然不同：

- 坐标 $m$：遍历不同取值时计算不同的输出行，**天然并行，互不干扰**。
- 坐标 $n$：遍历不同取值时计算不同的输出列，**天然并行，互不干扰**。
- 坐标 $k$：遍历不同取值时，所有计算结果全部累加至同一个输出位置 $C[m, n]$，**属于规约轴（Reduction），存在读-改-写（RaW）时序依赖**。

如果仅有 `indexing_maps`，编译器只知道“每个位置读哪个坐标”，但**无法推断不同任务之间是否能无锁并发**。若缺少 `iterator_types`，优化 Pass 极易将归约轴误当作并行轴发射到多个硬件核，引发多核同时覆写同一片内存的灾难。

下表将 IREE `inner_tiled` 与单体硬件 Spec 作了严格对照：

| 对比维度         | IREE 原版 `inner_tiled`                        | 紧耦合单体硬件 Spec (`#npu.spec`)      |
| :--------------- | :--------------------------------------------- | :------------------------------------- |
| **存在形态**     | 独立的计算 Operation，具备严格 SSA 依赖        | 静态属性（Attribute），依赖外部宿主 Op |
| **迭代属性**     | 显式内建 `iterator_types` (parallel/reduction) | 隐式推导或由后续执行函数分散提供       |
| **分块尺寸来源** | 结合张量 Shape 与硬件原语动态推导              | 显式固定在静态 `grid` 与 `extents` 中  |
| **硬件原语绑定** | 显式关联计算原语属性（如 MMA 布局）            | 缺失或由底层驱动隐藏解释               |
| **接口生态**     | 实现 `TilingInterface` 等全套 MLIR 标准接口    | 专有结构，脱离通用编译器 Pass 生态     |

### 2.3 策略三剑客：`translation_info`、`lowering_config` 与 `compilation_info`

IREE 将控制代码生成的策略高度抽象为三大元数据：

```graphviz
digraph strategy_trio {
    rankdir=TB;
    node [shape=box, style="rounded,filled", fontname="sans-serif", fontsize=10];
    edge [fontname="sans-serif", fontsize=9];

    subgraph cluster_input {
        label = "高层计算 IR";
        style = dashed;
        color = "#94a3b8";
        op [label="linalg.matmul\n(数学计算表达)", fillcolor="#f1f5f9"];
    }

    subgraph cluster_comp {
        label = "编译决策封装";
        color = "#d97706";
        comp [label="#iree_codegen.compilation_info\n(自动调优与外部注入的总入口)", fillcolor="#fef3c7"];
    }

    subgraph cluster_dispatch {
        label = "宏观管线分派 (Entry Point)";
        color = "#2563eb";
        trans [label="#iree_codegen.translation_info\n- pipeline = VectorDistribute\n- workgroup_size = [128, 1, 1]\n- subgroup_size = 64", fillcolor="#dbeafe"];
    }

    subgraph cluster_op {
        label = "微观算子降级 (Per-Op Lowering)";
        color = "#0d9488";
        low [label="#iree_gpu.lowering_config\n- workgroup = [32, 64, 0]\n- reduction = [0, 0, 32]\n- promote_operands = [0, 1]\n- mma_kind = MFMA_F32_16x16x16_F16", fillcolor="#ccfbf1"];
    }

    op -> comp [label="通过 Tuning 注入"];
    comp -> trans [label="分发至 Dispatch"];
    comp -> low [label="分发至 Compute Op"];

    trans -> target [label="决定 Pass 流水线组织"];
    low -> target [label="指导分块、向量化与搬运"];

    target [label="执行具体的 Codegen 生成目标指令", shape=ellipse, fillcolor="#e2e8f0"];
}
```

#### 1. `translation_info`：管线指挥官

`translation_info` 附着在分发入口（Dispatch Entry Point），负责回答：**这个计算核心要用哪条 Pass 流水线来编译？以及宏观计算拓扑如何划分？**

- `pipeline`：选择特定的后端 Pass 流水线（例如针对 GPU 的 `VectorDistribute` 或针对自定义加速器的专用流水线）。
- `workgroup_size`：每个执行工作组内的并发硬件线程/车道规模（例如 `[128, 1, 1]`）。
- `subgroup_size`：协同执行的子群/波前（Warp/Wavefront）规模。

#### 2. `lowering_config`：微观战术师

`lowering_config` 附着在具体的计算 Op 上，负责回答：**当前操作在进入该流水线后，各维度如何细粒度分块？是否需要搬运加速？**

- `workgroup` 分块：决定每个计算单元处理多大范围的输出（如 `[32, 64, 0]`）。
- `reduction` 分块：规约维度单次处理多大片段（如 `[0, 0, 32]`）。
- `promote_operands`：决定哪些输入张量需要从高延迟存储（DRAM）搬运提升到低延迟片上 SRAM。
- `mma_kind`：指定底层对应的硬件向量或矩阵计算指令原语（如 AMD MFMA、NVIDIA Tensor Core、RISC-V Vector 内核）。

#### 3. `compilation_info`：策略打包与自动调优（Auto-tuning）

如果想要探索 100 种不同的 Tile 组合与管线参数，开发者无需修改一行 C++ 代码。只需将 `translation_info` 与 `lowering_config` 组合为 `compilation_info`，通过 MLIR 的 Transform Dialect 或文本配置动态注入。编译器会自动将宏观参数分发至 Dispatch，将微观参数附着至算子，从而实现全自动化的搜索与基准测试（Benchmark）。

### 2.4 为什么多层 Tiling 不能用一个 `block_shape` 概括？

以 CPU/GPU/NPU 的通用存储层次为例，一次计算从外部内存到最终寄存器，天然存在多级切片需求：

```graphviz
digraph multi_tier_tiling {
    rankdir=TB;
    node [shape=box, style="rounded,filled", fontname="sans-serif", fontsize=10];
    edge [fontname="sans-serif", fontsize=9];

    subgraph cluster_dram {
        label = "全量数据 (DRAM)";
        style = dashed;
        color = "#64748b";
        t0 [label="完整张量 C: 2048 × 2048", fillcolor="#f1f5f9"];
    }

    subgraph cluster_l1 {
        label = "第一层：Distribution Tile (集群/多核任务划分)";
        color = "#2563eb";
        t1 [label="Workgroup / Core Tile: 128 × 128\n目的：任务切分给各个硬件核心并发执行", fillcolor="#dbeafe"];
    }

    subgraph cluster_l2 {
        label = "第二层：Cache / SRAM Tile (适应片上高速存储容量)";
        color = "#0d9488";
        t2 [label="SRAM / Cache Tile: 32 × 64\n目的：消除 DRAM 访存瓶颈，配合 DMA 双缓冲", fillcolor="#ccfbf1"];
    }

    subgraph cluster_l3 {
        label = "第三层：Hardware / Vector Tile (适应计算单元原生形状)";
        color = "#7c3aed";
        t3 [label="Register / Tensor Core Tile: 16 × 16 × 16\n目的：直接喂给硬件专用计算阵列指令", fillcolor="#ede9fe"];
    }

    t0 -> t1 [label="划分至 NPU Cores"];
    t1 -> t2 [label="DMA 搬运至 SRAM"];
    t2 -> t3 [label="寄存器加载并执行 MMA"];
}
```

在芯片硬件中，**片上 SRAM 容量、地址生成器（AG）的步长边界、以及计算单元（Tensor Core）的原生矩阵形状根本不是同一个数量级！**
如果像自研 Spec 那样只提供一个孤零零的 `block_shape=[16, 8]`，编译器后续 Pass 就必须硬编码大量隐晦的规则去猜测：这个 16 到底是指 SRAM 块大小，还是指令块大小？这正是架构劣化的典型根源。

---

## 三、终极质疑：为什么不直接用 MLIR 原生 `scf.for` / `scf.forall` 表示一切？

很多初涉 MLIR 的工程师会产生一个极具杀伤力的疑问：

> “既然属性会丢失、会过期，MLIR 又原生自带表达控制流的 `scf.for` 和 `scf.forall`，为什么我们不一开始就直接把代码降级成原生循环？循环结构清晰透明，难道不比那些玄学属性更好吗？”

这是一个极其深刻的问题。答案在于：**循环（SCF）描述的是已经确定的控制流结果；而配置属性（`lowering_config`）描述的是如何决策这个结果。**

### 3.1 相同计算的多种控制流形态

考虑同一个矩阵乘法 $C_{128 \times 128} = A_{128 \times 64} \times B_{64 \times 128}$，在不同策略下会生成完全不同的控制流：

#### 方案 A：朴素逐元素循环（适合最简单的标量 CPU 执行）

```mlir
scf.for %m = %c0 to %c128 step %c1 {
  scf.for %n = %c0 to %c128 step %c1 {
    scf.for %k = %c0 to %c64 step %c1 {
      // 逐点加载、乘加、写回
    }
  }
}
```

#### 方案 B：分块并行与规约循环（适合多核或 SIMD 处理器）

```mlir
scf.forall (%m, %n) in (%c4, %c2) {
  scf.for %k = %c0 to %c64 step %c32 {
    // 处理 32x64 的输出 Tile，K 轴步长 32 规约
  }
} {
  mapping = [#gpu.block<y>, #gpu.block<x>]
}
```

#### 方案 C：硬件地址发生器（AG）触发模式（适合具备硬件循环的 NPU）

```mlir
// CPU 不执行内部计算循环，仅写入少量配置寄存器
"npu.ag.configure"(%base, %step_16, %count_128) : () -> ()
"npu.dma.start"() : () -> ()
"npu.compute.trigger"() : () -> ()
"npu.sync.wait"() : () -> ()
```

如果一开始就在高层 IR 中强行物化为“方案 A”的循环，后续 Pass 若想改为“方案 B”，就必须经历痛苦且极其脆弱的**循环重构（Loop Interchange、Tiling、Distribution）**；若想转换为“方案 C”，更需要从茫茫循环中去逆向推断原本的张量算子意图。

### 3.2 致命差异：CPU 软件循环 vs 专用 AG 硬件自驱动循环

对于带有专用硬件地址生成器（AG）的 NPU，使用原生 SCF 循环存在一道难以逾越的鸿沟：

```mermaid
sequenceDiagram
    autonumber
    actor CPU as 控制核心 (RISC-V / Host)
    participant AG as 硬件地址发生器 (AG)
    participant SRAM as 片上 SRAM
    participant Core as 计算核心 (Tensor Core)

    Note over CPU,Core: 模式一：CPU 逐轮驱动 SCF 控制流 (开销巨大)
    loop 每轮迭代 (共 128 次)
        CPU->>CPU: 执行循环跳转指令 (bne/addi)
        CPU->>AG: 重新配置本轮偏移基址
        CPU->>Core: 发送计算启动指令
        Core-->>CPU: 中断 / 状态轮询完成
    end

    Note over CPU,Core: 模式二：AG 硬件自主循环模式 (单次配置，硬件全速)
    CPU->>AG: 一次性写入基址、步长、循环层数 (Count=128, Step=16)
    CPU->>Core: 启动计算引擎
    activate AG
    loop 硬件内部自动流转 128 次
        AG->>SRAM: 硬件自动吐出多维物理地址并拉取数据
        AG->>Core: 数据全速直通流水线
    end
    deactivate AG
    Core-->>CPU: 仅在 128 轮全部完成时上报一次事件 (Event)
```

在**模式二**中，CPU 执行完几条配置指令后便可直接休眠或处理其他任务，由 AG 硬件在芯片内部根据寄存器配置全速吐出地址。

如果编译器全程只使用 `scf.for`，后端就必须写一个极其复杂的模式匹配器（Pattern Matcher）：

1. 深入分析 SCF 循环的起始点、步长、上界（Trip Count）；
2. 追踪循环内部复杂的地址仿射表达式（如 `base + i * 16 + j * 256`）；
3. 证明该访存序列能够完全被 AG 硬件的有限寄存器完全表达；
4. 删除这一大堆 CPU 循环，替换为 AG 配置指令。

**这种模式识别极其脆弱！** 在实际工程中，只要上游任意一个通用的 Canonicalization 或 CSE（公共子表达式消除）Pass 将 `base + i * 16` 改写成了代数等价但结构不同的另一种表达式，你的 AG 模式匹配就会当场暴毙，导致硬件加速器退化为龟速的软件模拟。

下表总结了原生控制流与专用硬件描述的工程取舍：

| 评价维度             | 原生 SCF 优先路线                          | 专用硬件描述 / 配置优先路线                   |
| :------------------- | :----------------------------------------- | :-------------------------------------------- |
| **通用优化生态**     | 极佳，无缝接入 MLIR 原生循环变换 Pass      | 取决于是否自行实现了标准 Interface            |
| **硬件模式识别成本** | **极高**，需从复杂表达式中逆向恢复硬件意图 | **极低**，硬件参数在编译期显式直达            |
| **代码生成可靠性**   | 脆弱，易受通用代数化简 Pass 破坏           | 稳固，硬件指令与寄存器参数确定性映射          |
| **异构回退能力**     | 天然支持（直接下沉为标量/向量 CPU 循环）   | 较差，需要额外编写专门的 Fallback 降级通路    |
| **适用场景**         | 通用 CPU、通用 GPU、简单可展开循环         | 具备独立 AG、专用 DMA、异步流水机制的专用 NPU |

---

## 四、百家争鸣：全球顶尖 AI 编译器各显神通的本质原因

既然 MLIR 原生有 SCF，业界又开源了 IREE，为什么主流芯片与加速器厂商没有统一采用同一套开源 IR？

> **核心第一性原理**：越靠近数学计算，不同硬件加速器的共同点越多（都是矩阵乘、卷积、激活）；但越靠近数据移动、片上内存组织、异步同步与机器指令，硬件之间的物理差异越大！

```mermaid
flowchart TD
    subgraph S1["L1：数学计算语义 (高度统一)"]
        A1["StableHLO / TOSA / Linalg<br/>表示张量加减乘除、卷积、归约，完全与芯片硬件解耦"]
    end

    subgraph S2["L2：计算调度与变换 (部分统一)"]
        A2["SCF / Affine / Transform Dialect<br/>循环分块、算子融合、循环展开、向量化"]
    end

    subgraph S3["L3：存储布局与物理执行 (严重分化)"]
        P1["IREE: Pipeline / Lowering Config 属性"]
        P2["TVM: TensorIR 显式 Schedule 变换树"]
        P3["Triton: 线程/Warp/寄存器物理 Layout"]
        P4["Tenstorrent: NoC + Circular Buffer + 多层 Dialect"]
        P5["Arm Vela: 离线静态存储规划 + 命令流生成"]
    end

    subgraph S4["L4：底层机器指令与执行体 (完全专有)"]
        C1["GPU ISA / PTX"]
        C2["RISC-V Vector / Scalar"]
        C3["专用 NPU 寄存器二进制命令流"]
    end

    S1 --> S2
    S2 --> S3
    S3 --> S4
```

### 4.1 各大代表性开源编译器的工程取向剖析

#### 1. Apache TVM：将优化表达为可执行的变换流（Schedule API）

TVM（尤其是 TensorIR）并不倾向于在算子头上挂满最终静态配置属性，而是**将优化过程本身建模为一段可执行、可记录、可重放的变换动作**：

```python
# TVM TensorIR Schedule 典型范式
sch = tir.Schedule(mod)
block = sch.get_block("C")
i, j, k = sch.get_loops(block)

# 显式执行循环拆分与重排
io, ii = sch.split(i, factors=[None, 32])
jo, ji = sch.split(j, factors=[None, 64])
sch.reorder(io, jo, ii, ji, k)
```

- **工程收益**：TVM 的这种设计天然适配其 MetaSchedule 自动调优框架。调优系统可以随意组合变换动作，记录调优轨迹（Trace），并在真实设备上执行搜索与性能回归。

#### 2. Triton：围绕 GPU 线程体系建立极致的物理 Layout 抽象

Triton 面向现代 GPU Kernel 编程，它关注的核心不是普通的循环，而是：**张量的某一个元素到底位于哪一个 Warp、哪一个 Lane、哪一个物理寄存器？**

```python
# Triton BlockedLayout 示意
gl.BlockedLayout(
    size_per_thread=[2, 4],     # 每个线程持有的元素数量
    threads_per_warp=[16, 2],    # Warp 内部 32 个线程的排布形状
    warps_per_cta=[2, 2],        # 线程块内部 Warp 的二维网格
    order=[1, 0]                # 内存维度的物理排布顺序
)
```

- **工程收益**：在 GPU 上，共享内存 Bank 冲突与寄存器跨线程通信是性能生死的关键。Triton 将 Layout 提升为一等公民（First-Class Entity），使得编译器能够在高级 IR 层面精确推理跨 Warp 数据重排的开销。

#### 3. Tenstorrent (TT-MLIR)：基于片上网络（NoC）的系统级多层方言

Tenstorrent 的硬件架构由数十甚至数百个 Tensix 核心组成，核心之间通过 NoC（片上网络）连接，拥有本地 L1 SRAM 与环形缓冲区（Circular Buffer）。它直接定义了四个阶梯式 Dialect：

```mermaid
flowchart LR
    TTIR["TTIR<br/>高层张量计算"] --> TTNN["TTNN<br/>设备张量布局与 API"]
    TTNN --> TTKernel["TTKernel<br/>NoC 异步读取与 CB 压入"]
    TTKernel --> TTMetal["TTMetal<br/>硬件程序发射与底层命令"]
```

- **工程收益**：`ttkernel.noc_async_read` 具有明确的异步硬件副作用，普通 MLIR `memref.load` 根本无法表达这种带有事务语义的硬件行为。多层 Dialect 明确划分了前端框架、驱动库与硬件微码的团队职责边界。

#### 4. Arm Vela：轻量级嵌入式 NPU 的离线 AOT 调度器

Arm Ethos-U NPU 属于典型的命令流驱动设备。Vela 并不试图构建复杂的通用 JIT 编译器，而是直接将 TFLite/TOSA 模型转换为专用的 NPU Command Stream：

- 离线全静态内存规划（SRAM Scratchpad Allocation）；
- 将卷积与激活算子融合为 NPU 硬件可执行的原子 Block 命令；
- 编译器与底层驱动（Driver）、链接脚本（Linker Script）严格对齐内存基址契约。

---

## 五、工程维护成本的灵魂拷问：Attribute、原生循环与专用 Dialect 的稳定性与陷阱

在实际编译器研发中，很多架构师会敏锐地指出：**“过度依赖 Attribute 会面临严峻的透传（Propagation）失效问题，后续 Pass 只要改动了 IR，属性就会丢失或过期！”**

### 5.1 真实案例复盘：IREE 官方 Issue #25190

这绝不是纸上谈兵的理论担忧，而是工业界真实踩过的雷。2026 年 11 月，IREE 社区报告了一个典型 Bug：

> **IREE Issue #25190**：在编译 Batchless 卷积（Batch 维度未显式展开）时，前端 Transform Dialect 为卷积算子成功注入了包含 Tile 参数的 `compilation_info`。然而，后续的 `InsertBatchDimForBatchlessConv` Pass 在执行模式重写时，通过 `replaceOpWithNewOp` 创建了新的卷积算子，**但并未将原算子上的 `lowering_config` 复制过去！**
>
> 结果是：后端策略选择器由于找不到配置，退化到了异常默认分支，最终因生成了超出硬件限制的巨型向量而导致编译彻底崩溃。

### 5.2 Attribute 的三大致命软肋

```graphviz
digraph attr_hazards {
    rankdir=LR;
    node [shape=box, style="rounded,filled", fontname="sans-serif", fontsize=10];
    edge [fontname="sans-serif", fontsize=9];

    subgraph cluster_types {
        label = "属性三大工程陷阱";
        color = "#e11d48";
        h1 [label="1. 信息丢失 (Lost)\nOp 被重写后，新 Op 漏掉了旧属性", fillcolor="#ffe4e6"];
        h2 [label="2. 信息过期 (Stale)\n循环维度被重排，属性数值未同步更新", fillcolor="#ffe4e6"];
        h3 [label="3. 信息失效 (Invalid)\n降级流水线切换，原硬件配置不再合法", fillcolor="#ffe4e6"];
    }

    c1 [label="编译当场崩溃 (Assert / Fail)", fillcolor="#fef3c7"];
    c2 [label="静默生成错误代码 (Silent Bug / Crash)", fillcolor="#fee2e2"];

    h1 -> c1;
    h2 -> c2;
    h3 -> c1;
}
```

1. **信息丢失（Lost）**：
   在 MLIR 中，`PatternRewriter::replaceOpWithNewOp<NewOp>(oldOp, ...)` 的底层实现机制是创建新节点、重连 SSA 依赖、并彻底销毁旧节点。**通用框架绝不会主动帮你把旧 Op 上所有的杂项 Attribute 全部拷贝到新 Op 上！** 拷贝哪些、如何重构必须由具体 Pattern 显式指定。
2. **信息过期（Stale，最隐蔽、最致命！）**：
   假设一个 MatMul 算子原有属性 `tile_sizes = [32, 64, 16]`，对应维度为 `[M, N, K]`。此时某个优化 Pass 对计算进行了转置或循环交换（Loop Interchange），将计算维度变更为 `[N, M, K]`。
   如果 Pass 开发者自作聪明地执行了“盲目复制属性”，那么新算子上的 `tile_sizes = [32, 64, 16]` 就会把原本属于 $M$ 的 32 错配给 $N$，导致原本属于 $N$ 的 64 错配给 $M$！这种错误不会触发任何断言报错，而是在硬件上产生性能暴跌甚至错误的访存越界。
3. **信息失效（Invalid）**：
   原有属性配置在专用的 DMA 流水线中是合法的；但当编译遇到特殊边缘分支被迫回退（Fallback）到通用标量流水线时，标量流水线无法识别或无法满足该配置的硬件对齐要求，最终导致编译失败。

### 5.3 MLIR 底层机制：Inherent vs Discardable Attribute

为了从根本上理解属性生命周期，必须弄清 MLIR 官方对属性的严格分类：

| 属性分类                                          | 官方规范定义                                                                                                                            | 在代码中的物理载体                                         | Pass 遇到未知属性时的默认行为                                  |
| :------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------- | :------------------------------------------------------------- |
| **Inherent Attribute** (固有属性 / Op Properties) | **属于该 Operation 核心语义不可分割的一部分**。例如算术比较的谓词、卷积的 Padding 边界。缺少它，Op 本身连语法校验（Verify）都无法通过。 | C++ 类成员变量或专有 Property 结构体                       | 任何重写该 Op 的 Pass 必须显式处理，否则编译期类型检查报错。   |
| **Discardable Attribute** (可丢弃 / 附加属性)     | **由外部方言附加在宿主 Op 上的编译元数据**。例如 `#npu.lowering_config`。它不属于宿主 Op（如 `linalg.matmul`）自身定义的一部分。        | 存储于通用 Attribute Dictionary 中（带有方言命名空间前缀） | 通用 Pass 在重写宿主 Op 时，**默认直接丢弃**，不负有维护责任。 |

这深刻揭示了一个铁律：**除非你自己编写的 Pass 显式识别并重新映射了某个 Discardable Attribute，否则指望外部通用 Pass 替你维持其正确性是不切实际的！**

### 5.4 科学的属性生命周期防御契约

要根治属性失效，团队必须在编译管线中确立四种严格的转换契约：

```cpp
// 架构级伪代码：安全的属性重映射与失效决策树
auto oldConfig = getLoweringConfig(oldOp);
auto newOp = rewriter.create<NewOp>(...);

if (oldConfig) {
    if (isDimensionPreserved(oldOp, newOp)) {
        // 契约 1: 语义不变，安全继承 (Preserve)
        setLoweringConfig(newOp, oldConfig);
    } else if (canRemapPermutation(oldOp, newOp)) {
        // 契约 2: 维度发生置换，严格数学重映射 (Remap)
        auto remappedConfig = remapConfig(oldConfig, oldOp, newOp);
        setLoweringConfig(newOp, remappedConfig);
    } else if (isHeuristicTuningHint(oldConfig)) {
        // 契约 3: 仅为调优提示，重写后主动废弃，触发重新推导 (Invalidate)
        discardConfig(oldConfig);
    } else {
        // 契约 4: 属于强制物理约束，无法安全继承时立即熔断报错 (Reject)
        return rewriter.notifyMatchFailure(oldOp, "Cannot safely preserve lowering config!");
    }
}
```

---

## 六、架构抉择之争：连续多个 Pass 只产生 Attribute，最后单 Pass 一次性 Lowering 究竟好不好？

在芯片编译器的实际开发中，经常会有年轻工程师提出一种看似极其优雅的架构设想：

> “既然 Pass 之间频繁修改 IR 容易丢失属性且极其难调试，我们为什么不让前面的 10 个 Pass 统统只做纯静态分析，每一步只往算子上写 Attribute；直到流水线最后一步，才由一个唯一的 Materialization Pass 读取所有属性，一口气生成所有底层硬件指令？这样前面的 IR 结构完全不动，调优和排错难道不轻松得多吗？”

然而，当向经验丰富的编译器主管汇报时，主管往往会当头浇下一盆冷水：

> **“不行！把所有复杂性全堆在最后一个 Pass，是一个极其糟糕、沉重且不可持续的‘巨石（Monolithic）’设计！”**

究竟谁是对的？

```graphviz
digraph debate {
    rankdir=TB;
    node [shape=box, style="rounded,filled", fontname="sans-serif", fontsize=10];
    edge [fontname="sans-serif", fontsize=9];

    subgraph cluster_dev {
        label = "初创开发者的理想：单体物化";
        color = "#2563eb";
        d1 [label="Pass 1..N: 只做只读分析，只写 Attribute\nIR 结构恒定不变，极易打印对比", fillcolor="#dbeafe"];
        d2 [label="Final Pass: 终极大一统物化\n一次性翻译为硬件底层机器指令", fillcolor="#bfdbfe"];
        d1 -> d2;
    }

    subgraph cluster_lead {
        label = "资深架构师的担忧：巨石崩塌";
        color = "#e11d48";
        l1 [label="状态黑洞：内部同时负责 Fusion/Tiling/SMEM/DMA/Sync\n失去 MLIR 原生 Verifier 与 Pass 隔离", fillcolor="#ffe4e6"];
        l2 [label="虚拟 IR 困境：后续分析 Pass 不得不推理‘未发生之未来’\n（如在未物化 Fusion 上预测 SRAM 冲突）", fillcolor="#fecdd3"];
    }

    d2 -> l1 [style=dotted, label="现实碰撞"];
    d1 -> l2 [style=dotted, label="现实碰撞"];
}
```

### 6.1 剖析最后一个巨型 Pass 的三大致命陷阱

表面上看，“只生属性、最后统一物化”确实避免了属性丢失，但它并没有消灭编译复杂性，而是将本应由编译器基础设施分摊的复杂度，全部暴力转移到了最后一个 Pass 内部：

1. **职责无限蔓延，变成无法维护的“第二编译器”**：
   最后一个 Pass 绝不是做简单的文本翻译，它必须同时在一个函数体里解决：
   - 算子融合（Fusion）的 SSA 结果重连；
   - 多级循环分块（Tiling）的边界条件与余数块处理；
   - 内存分配与张量别名分析（Bufferization）；
   - 片上 SRAM 的物理地址分配与生命周期冲突解决；
   - DMA 异步搬运的插入时机与大小计算；
   - AG 硬件循环步长与计数值寄存器写入；
   - 计算核心启动与跨硬件模块事件（Event）同步机制。

   一旦硬件架构新增了一种特殊的内存搬运模式，开发者必须通读并小心翼翼地修改这几千行纠缠在一起的代码，团队协作将演变为灾难。

2. **丧失 MLIR 最核心的“中间状态可观测性与验证力”**：
   MLIR 基础设施最强大的优势，在于每个 Pass 执行完毕后都可以自动运行 `verify()`，且可以通过 `--mlir-print-ir-after-all` 将中间 IR 完整 Dump 出来进行逐行比对（FileCheck）。
   一旦所有转换全部塞进一个巨型 Pass，PassManager 只能看到“输入是高层 MatMul，输出是一堆十六进制寄存器”，所有的中间变换状态全变成了 C++ 内部的临时私有数据结构，调试排错的难度呈指数级跃升。
3. **“虚拟 IR”的恶性膨胀与预测难题**：
   **这是理论上最致命的反驳**！很多决策必须基于前面变换后的**真实物理 IR** 才能做出。
   例如：只有当算子融合（Fusion）真实发生后，中间临时张量才会被消除；只有中间张量被消除了，才能准确知道 SRAM 还剩下多少字节；只有知道 SRAM 确切剩余空间，才能决定当前的 Tile 是否装得下！
   如果你坚决不在中间 Pass 中修改 IR，那么负责规划 SRAM 的分析 Pass 就必须在自己的脑海中“虚拟模拟”算子融合后的各种假想情况。你实际上是在属性系统之上，不得不又徒手编写了一套极其别扭的“虚拟编译器解释器”！

### 6.2 唯一例外：为什么 MLIR 官方的 One-Shot Bufferize 可以作为 Monolithic Pass？

有人会反问：“MLIR 官方核心的 `One-Shot Bufferize` 不就是一个典型的巨型 Pass 吗？它就是全模块静态分析后一次性原地重写的啊！”

没错，但请注意它的成功前提：

- **职责极端单一聚焦**：One-Shot Bufferize **仅仅负责且只负责**张量值语义（Tensor）向内存指针（MemRef）的原地复用映射。
- 它绝不同时负责循环分块、不同时负责算子融合、不同时负责底层硬件指令生成。它的输入与输出接口有极其严格的理论数学模型定义（RaW 别名分析）。

### 6.3 破局之道：推荐架构——“阶段性规划与阶段性物化”（Phased Plan-then-Lower）

真正的编译系统工程艺术，不是在“每个 Pass 都改 IR”与“所有 Pass 都不改 IR”之间走极端，而是确立**按抽象领域分阶段的闭环流转机制**：

```mermaid
flowchart TD
    subgraph P1["阶段一：计算语义规划与物化 (Compute Phase)"]
        A1["输入 Linalg / Tensor IR"] --> B1["分析 Shape & Fusion 契约"]
        B1 --> C1["生成 Compute Plan (Tile 尺寸、融合边界)"]
        C1 --> D1["物化一：Materialize Compute<br/>执行实际 Tiling 与 Fusion，产出真实分块循环与 SSA"]
    end

    subgraph P2["阶段二：物理内存规划与物化 (Memory Phase)"]
        D1 --> A2["面对真实分块 IR，分析实际张量生命周期"]
        A2 --> B2["生成 Memory Plan (SRAM 分配、Ping-Pong 布局)"]
        B2 --> C2["物化二：Materialize Memory<br/>执行 Bufferization，分配具体物理 MemRef"]
    end

    subgraph P3["阶段三：硬件执行规划与物化 (Execution Phase)"]
        C2 --> A3["面对真实内存 Buffer，规划 DMA 与 AG 模式"]
        A3 --> B3["生成 Execution Plan (硬件循环计数、同步令牌)"]
        B3 --> C3["物化三：Materialize Execution<br/>生成专用 DMA、AG 及同步事件 Op"]
    end

    subgraph P4["阶段四：目标机器代码生成 (Target Phase)"]
        C3 --> F["下沉至自定义指令、MMIO 寄存器配置与 RISC-V ELF 镜像"]
    end

    style D1 fill:#0d9488,color:#fff
    style C2 fill:#0d9488,color:#fff
    style C3 fill:#0d9488,color:#fff
```

下表对比了三种架构方案在真实工程中的各项指标：

| 评价维度           | 方案 A：每步都改 IR          | 方案 B：纯单体巨石 Pass             | **方案 C：阶段性规划与物化（推荐）**             |
| :----------------- | :--------------------------- | :---------------------------------- | :----------------------------------------------- |
| **属性透传风险**   | 极高（每次重写都可能丢属性） | 无（前面根本不改 IR）               | **受控**（属性生命周期严格限制在阶段内）         |
| **调试与排错难度** | 困难（状态变化过于频繁碎裂） | **极难**（巨石函数内部无检查点）    | **最优**（每个大阶段均可验证和 Dump IR）         |
| **中间依赖准确性** | 准确（基于真实 IR）          | **极差**（靠脑补模拟未发生的变换）  | **高度准确**（下一阶段永远基于上阶段的真实产物） |
| **模块解耦与协作** | 较好                         | 极差（多人同时修改同一个巨石 Pass） | **极佳**（计算、存储、执行模块职责清晰分离）     |

---

## 七、自研 NPU 编译器的工程落地指南与审查清单

结合前文所有第一性原理与架构辨析，在规划或重构自研硬件编译器时，我们建议团队设立以下落地方针：

### 7.1 自定义 Op / Attribute 的架构准入五问审查表

任何工程师在向方言中提交新的 Operation 或 Attribute 时，必须通过以下五项硬核指标的审查：

```graphviz
digraph checklist {
    rankdir=LR;
    node [shape=box, style="rounded,filled", fontname="sans-serif", fontsize=10];
    edge [fontname="sans-serif", fontsize=9];

    start [label="拟引入新的自定义\nOp / Attribute", shape=diamond, fillcolor="#fef3c7"];

    q1 [label="1. MLIR 原生 Op (Linalg/SCF/MemRef)\n真的完全无法表达该语义吗？", fillcolor="#f1f5f9"];
    q2 [label="2. 它是否能消除多个 Pass 内部\n重复编写的高危模式匹配逻辑？", fillcolor="#f1f5f9"];
    q3 [label="3. 是否配备了完整的 C++ verify()\n确保编译期能拦截非法参数？", fillcolor="#f1f5f9"];
    q4 [label="4. 当下代硬件升级时\n该属性是否会将修改扩散到顶层？", fillcolor="#f1f5f9"];
    q5 [label="5. 该信息究竟是计算语义\n还是可被覆盖的暂定调优策略？", fillcolor="#f1f5f9"];

    pass [label="允许进入方言定义", fillcolor="#dcfce7"];
    reject [label="驳回！优先复用标准基础设施", fillcolor="#fee2e2"];

    start -> q1;
    q1 -> q2 [label="是无法表达"];
    q1 -> reject [label="否，能复用原生"];
    q2 -> q3 [label="是消除重复"];
    q2 -> reject [label="否，过度设计"];
    q3 -> q4 [label="具备 Verifier"];
    q3 -> reject [label="缺少校验逻辑"];
    q4 -> q5 [label="修改局限在后端"];
    q4 -> reject [label="污染了高层抽象"];
    q5 -> pass [label="概念严格界定"];
}
```

### 7.2 必须优先投入建设的三大测试与调试基础设施

在没有芯片实物、仅依赖 EDA 硬件仿真（Simulation）的早期攻坚阶段，建设以下三套基础设施能够为团队节省数以月计的排错时间：

1. **AG 地址序列硬件等价性验证工具（Address Equivalence Checker）**：
   无需启动耗时漫长的整网仿真。在 CPU 端通过数学模型计算出该算子在逻辑上期望访问的绝对地址序列：
   $$Addr_{\text{expected}} = [0, 16, 32, 48, \dots]$$
   再编写一个轻量测试 Pass，读取编译器生成的 AG 寄存器配置，执行硬件寻址状态机并吐出硬件地址序列：
   $$Addr_{\text{hardware}} = [0, 16, 32, 48, \dots]$$
   两相对比，若有偏差当场在编译期截杀，绝不把地址步进错误留到 EDA 仿真期去抓波形。
2. **IR 指令来源追踪机制（IR-to-ASM Provenance）**：
   在最终生成的机器码或汇编中，利用 LLVM 的 `Location` 机制保留每条底层配置指令对应的顶层高层算子名称与 Pass 变换源头：
   ```text
   // 汇编调试注记示例
   SET_AG_STEP r1, 16     ; [Source: linalg.matmul @ line 42] -> [Pass: ExecutionMaterialize]
   SET_AG_COUNT r2, 128   ; [Derived from: TilePlanningStrategy v2]
   ```
3. **策略属性差异比对器（Plan Diff Tool）**：
   在自动调优或性能回归测试中，将前后两次编译生成的 Execution Plan 属性直接做文本 Diff，精准定位性能涨跌究竟是由于 Tile 尺寸缩减、双缓冲退化，还是因为 AG 步长模式未命中。

---

## 八、总结与终极思考

在 AI 编译器波澜壮阔的发展长河中，从来不存在所谓的“银弹设计”。

- **IREE** 的伟大之处，在于其展现了多目标、大规模体系下**计算语义与编译策略高度解耦**的架构范式，以及面向自动调优的顶层包容力；
- **TVM** 教会了我们如何将调度与变换本身抽象为严谨、可重放的动作流；
- **Triton** 启示了我们对底层硬件寄存器与物理布局（Layout）保持敬畏；
- **Tenstorrent 与 Arm** 则展现了面向非 GPU 式定制芯片时，如何坚定地围绕硬件执行机制构筑专用防线。

对于正在自研专用硬件加速器（NPU）编译器的团队，最明智的演进路线既不是全盘盲目抄袭 IREE 的每一套复杂接口，也不是固步自封地死守一个不可分割的单体属性，更不是将所有转换压在最后一个庞大 Pass 内部。

**在能通用的地方最大化复用开源基础设施，在必须专有的边界清晰隔离硬件异构事实；先规划后分阶段物化，让错误尽可能在最早的静态分析阶段被检验和拦截。** 这才是构筑一款高可靠、高性能、生命力跨越芯片代际周期的工业级 AI 编译器的坚实基石。
