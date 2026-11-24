import type { AsmLineItem } from "./types";
import { compileCppToAssembly } from "./compiler-explorer-engine";
import { renderAsmPaneHtml, renderSourcePaneHtml } from "./asm-highlighter";

const COPY_ICON = `<svg class="size-3.5 inline-block me-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg class="size-3.5 inline-block me-1 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const REFRESH_ICON = `<svg class="size-3.5 inline-block me-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`;
const FULLSCREEN_ICON = `<svg class="size-3.5 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
const EXIT_FULLSCREEN_ICON = `<svg class="size-3.5 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="10" y1="14" x2="3" y2="21"/></svg>`;
const SPINNER_ICON = `<svg class="size-3.5 inline-block animate-spin text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

export interface AsmInspectorController {
  open: (sourceCode: string, lang: "c" | "cpp") => Promise<void>;
  close: () => void;
  isOpen: () => boolean;
}

/**
 * Creates and mounts an interactive dual-pane RISC-V 64 Assembly Inspector for a code block.
 */
export function createAsmInspector(
  wrapper: HTMLElement,
  getLatestCode?: () => string
): AsmInspectorController {
  const container = document.createElement("div");
  container.className =
    "asm-inspector-container hidden my-6 rounded-2xl border border-sky-500/30 bg-[#0d1017]/95 shadow-xl backdrop-blur-md transition-all duration-300";

  container.innerHTML = `
    <!-- Inspector Header & Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/50 px-4 py-2.5 text-xs select-none">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1.5">
          <span class="size-2 rounded-full bg-sky-400 animate-pulse inline-block"></span>
          <span class="font-semibold text-foreground/95">RISC-V 64 汇编对照视窗</span>
        </div>
        <span class="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-sky-400">
          GCC 14.2 (rv64gc)
        </span>
        <div class="flex items-center gap-1">
          <label class="text-[11px] text-muted-foreground hidden sm:inline">优化等级:</label>
          <select class="asm-preset-select rounded-md border border-border/70 bg-surface-container-low/90 dark:bg-surface-container-low px-2 py-0.5 text-[11px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-sky-500/60 cursor-pointer">
            <option value="-O2 -std=c++23 -pthread" selected>-O2 (标准优化)</option>
            <option value="-O3 -std=c++23 -march=rv64gcv -pthread">-O3 + RVV (向量扩展)</option>
            <option value="-O1 -std=c++23 -pthread">-O1 (基础指令)</option>
            <option value="-O0 -std=c++23 -pthread">-O0 (无优化直译)</option>
          </select>
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <!-- Mobile View Tabs -->
        <div class="asm-tab-group flex md:hidden items-center p-0.5 rounded-lg bg-surface-container-high/60 border border-border/50 text-[11px]">
          <button type="button" class="tab-btn tab-btn-source px-2 py-0.5 rounded-md font-medium text-sky-400 bg-sky-500/15">源码</button>
          <button type="button" class="tab-btn tab-btn-asm px-2 py-0.5 rounded-md text-muted-foreground hover:text-foreground">汇编</button>
        </div>

        <button type="button" class="btn-refresh-asm inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-sky-400 hover:border-sky-500/40 hover:bg-sky-500/10 transition-colors cursor-pointer" title="重新编译并生成汇编">
          ${REFRESH_ICON}<span class="hidden sm:inline">重新生成</span>
        </button>
        <button type="button" class="btn-copy-asm inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-sky-400 hover:border-sky-500/40 hover:bg-sky-500/10 transition-colors cursor-pointer" title="复制 RISC-V 64 汇编代码">
          ${COPY_ICON}<span>复制汇编</span>
        </button>
        <button type="button" class="btn-fullscreen-asm inline-flex items-center justify-center size-7 rounded-lg border border-border/60 bg-surface/50 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer" title="全屏/最大化沉浸对照">
          ${FULLSCREEN_ICON}
        </button>
        <button type="button" class="btn-close-asm inline-flex items-center justify-center size-7 rounded-lg border border-border/60 bg-surface/50 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer" title="收起汇编视窗">
          ✕
        </button>
      </div>
    </div>

    <!-- Inspector Dual-Pane Body -->
    <div class="asm-split-body grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/40 overflow-hidden font-mono text-xs">
      <!-- Left Pane: Source View -->
      <div class="source-pane flex flex-col min-w-0 bg-[#0d1017]/80">
        <div class="pane-header flex items-center justify-between px-3 py-1.5 border-b border-border/30 text-[11px] text-muted-foreground select-none bg-surface-container-low/40">
          <span class="flex items-center gap-1.5 font-medium text-foreground/80">
            <span class="size-1.5 rounded-full bg-emerald-400 inline-block"></span>
            C/C++ 源码
          </span>
          <span class="text-[10px] text-muted-foreground/80 hidden sm:inline">悬停高亮对应汇编，点击平滑滚动</span>
        </div>
        <div class="source-scroll flex-1 overflow-y-auto p-2 max-h-[460px] selection:bg-emerald-500/30">
          <div class="source-content"></div>
        </div>
      </div>

      <!-- Right Pane: RISC-V 64 Assembly View -->
      <div class="asm-pane flex flex-col min-w-0 bg-[#0b0e14]">
        <div class="pane-header flex items-center justify-between px-3 py-1.5 border-b border-border/30 text-[11px] text-muted-foreground select-none bg-surface-container-low/40">
          <span class="flex items-center gap-1.5 font-medium text-foreground/80">
            <span class="size-1.5 rounded-full bg-sky-400 inline-block"></span>
            RISC-V 64 目标汇编
          </span>
          <span class="asm-status-badge text-[10px] font-mono text-muted-foreground">就绪</span>
        </div>
        <div class="asm-scroll flex-1 overflow-y-auto p-2 max-h-[460px] selection:bg-sky-500/30">
          <div class="asm-content"></div>
        </div>
      </div>
    </div>
  `;

  wrapper.appendChild(container);

  // Element references
  const selectPreset = container.querySelector(
    ".asm-preset-select"
  ) as HTMLSelectElement;
  const btnRefresh = container.querySelector(
    ".btn-refresh-asm"
  ) as HTMLButtonElement;
  const btnCopyAsm = container.querySelector(
    ".btn-copy-asm"
  ) as HTMLButtonElement;
  const btnFullscreen = container.querySelector(
    ".btn-fullscreen-asm"
  ) as HTMLButtonElement;
  const btnClose = container.querySelector(
    ".btn-close-asm"
  ) as HTMLButtonElement;
  const sourcePane = container.querySelector(".source-pane") as HTMLElement;
  const asmPane = container.querySelector(".asm-pane") as HTMLElement;
  const sourceContent = container.querySelector(
    ".source-content"
  ) as HTMLElement;
  const asmContent = container.querySelector(".asm-content") as HTMLElement;
  const sourceScroll = container.querySelector(".source-scroll") as HTMLElement;
  const asmScroll = container.querySelector(".asm-scroll") as HTMLElement;
  const asmStatusBadge = container.querySelector(
    ".asm-status-badge"
  ) as HTMLElement;

  const tabBtnSource = container.querySelector(
    ".tab-btn-source"
  ) as HTMLButtonElement;
  const tabBtnAsm = container.querySelector(
    ".tab-btn-asm"
  ) as HTMLButtonElement;

  let currentSource = "";
  let currentLang: "c" | "cpp" = "cpp";
  let currentAsmText = "";
  let currentAsmLines: AsmLineItem[] = [];
  let isFullscreen = false;
  let activeTab: "source" | "asm" = "source";
  let isLoading = false;

  // Tab switching for mobile/tablet
  const updateMobileTabs = () => {
    if (activeTab === "source") {
      sourcePane.classList.remove("hidden");
      asmPane.classList.add("hidden");
      tabBtnSource.className =
        "tab-btn tab-btn-source px-2 py-0.5 rounded-md font-medium text-sky-400 bg-sky-500/15";
      tabBtnAsm.className =
        "tab-btn tab-btn-asm px-2 py-0.5 rounded-md text-muted-foreground hover:text-foreground";
    } else {
      sourcePane.classList.add("hidden");
      asmPane.classList.remove("hidden");
      tabBtnAsm.className =
        "tab-btn tab-btn-asm px-2 py-0.5 rounded-md font-medium text-sky-400 bg-sky-500/15";
      tabBtnSource.className =
        "tab-btn tab-btn-source px-2 py-0.5 rounded-md text-muted-foreground hover:text-foreground";
    }
  };

  tabBtnSource?.addEventListener("click", () => {
    activeTab = "source";
    updateMobileTabs();
  });

  tabBtnAsm?.addEventListener("click", () => {
    activeTab = "asm";
    updateMobileTabs();
  });

  // Responsive tab visibility check
  const handleResize = () => {
    if (window.innerWidth >= 768) {
      sourcePane.classList.remove("hidden");
      asmPane.classList.remove("hidden");
    } else {
      updateMobileTabs();
    }
  };
  window.addEventListener("resize", handleResize);

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    isFullscreen = !isFullscreen;
    if (isFullscreen) {
      container.classList.add(
        "fixed",
        "inset-0",
        "z-50",
        "rounded-none",
        "border-0",
        "m-0",
        "p-4",
        "sm:p-6",
        "bg-[#0b0e14]/98",
        "flex",
        "flex-col"
      );
      container.classList.remove("my-6", "rounded-2xl");
      sourceScroll.classList.remove("max-h-[460px]");
      asmScroll.classList.remove("max-h-[460px]");
      sourceScroll.classList.add("max-h-[calc(100vh-140px)]");
      asmScroll.classList.add("max-h-[calc(100vh-140px)]");
      btnFullscreen.innerHTML = EXIT_FULLSCREEN_ICON;
      btnFullscreen.title = "退出全屏 (ESC)";
      document.body.style.overflow = "hidden";
    } else {
      container.classList.remove(
        "fixed",
        "inset-0",
        "z-50",
        "rounded-none",
        "border-0",
        "m-0",
        "p-4",
        "sm:p-6",
        "bg-[#0b0e14]/98",
        "flex",
        "flex-col"
      );
      container.classList.add("my-6", "rounded-2xl");
      sourceScroll.classList.add("max-h-[460px]");
      asmScroll.classList.add("max-h-[460px]");
      sourceScroll.classList.remove("max-h-[calc(100vh-140px)]");
      asmScroll.classList.remove("max-h-[calc(100vh-140px)]");
      btnFullscreen.innerHTML = FULLSCREEN_ICON;
      btnFullscreen.title = "全屏/最大化沉浸对照";
      document.body.style.overflow = "";
    }
  };

  btnFullscreen?.addEventListener("click", toggleFullscreen);

  // ESC to exit fullscreen
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && isFullscreen) {
      toggleFullscreen();
    }
  });

  // Copy Assembly
  btnCopyAsm?.addEventListener("click", async () => {
    if (!currentAsmText) return;
    await navigator.clipboard.writeText(currentAsmText);
    btnCopyAsm.innerHTML = `${CHECK_ICON}<span>已复制</span>`;
    setTimeout(() => {
      btnCopyAsm.innerHTML = `${COPY_ICON}<span>复制汇编</span>`;
    }, 1500);
  });

  // Close inspector
  const close = () => {
    if (isFullscreen) toggleFullscreen();
    container.classList.add("hidden");
  };
  btnClose?.addEventListener("click", close);

  // Setup Linked Line Highlighting (Source <--> Asm)
  const setupLineHoverLink = () => {
    const asmRows = Array.from(
      asmContent.querySelectorAll<HTMLElement>(".asm-row")
    );
    const sourceRows = Array.from(
      sourceContent.querySelectorAll<HTMLElement>(".source-row")
    );

    const clearHighlights = () => {
      asmRows.forEach(row => {
        row.classList.remove("bg-sky-500/25", "ring-1", "ring-sky-500/50");
      });
      sourceRows.forEach(row => {
        row.classList.remove("bg-sky-500/25", "ring-1", "ring-sky-500/50");
      });
    };

    // Hover over Assembly Line -> highlight Source Line
    asmRows.forEach(row => {
      row.addEventListener("mouseenter", () => {
        clearHighlights();
        row.classList.add("bg-sky-500/25", "ring-1", "ring-sky-500/50");

        const srcLine = row.dataset.sourceLine;
        if (srcLine) {
          const matchSource = sourceContent.querySelector<HTMLElement>(
            `.source-row[data-source-line="${srcLine}"]`
          );
          if (matchSource) {
            matchSource.classList.add(
              "bg-sky-500/25",
              "ring-1",
              "ring-sky-500/50"
            );
          }
        }
      });

      row.addEventListener("mouseleave", clearHighlights);

      // Click assembly row to smoothly scroll source row into view
      row.addEventListener("click", () => {
        const srcLine = row.dataset.sourceLine;
        if (srcLine) {
          const matchSource = sourceContent.querySelector<HTMLElement>(
            `.source-row[data-source-line="${srcLine}"]`
          );
          if (matchSource) {
            matchSource.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }
        }
      });
    });

    // Hover over Source Line -> highlight all corresponding Assembly Lines
    sourceRows.forEach(row => {
      row.addEventListener("mouseenter", () => {
        clearHighlights();
        row.classList.add("bg-sky-500/25", "ring-1", "ring-sky-500/50");

        const srcLine = row.dataset.sourceLine;
        if (srcLine) {
          const matchingAsmRows = asmContent.querySelectorAll<HTMLElement>(
            `.asm-row[data-source-line="${srcLine}"]`
          );
          matchingAsmRows.forEach(asmRow => {
            asmRow.classList.add("bg-sky-500/25", "ring-1", "ring-sky-500/50");
          });
        }
      });

      row.addEventListener("mouseleave", clearHighlights);

      // Click source row to smoothly scroll first corresponding assembly row into view
      row.addEventListener("click", () => {
        const srcLine = row.dataset.sourceLine;
        if (srcLine) {
          const firstAsmRow = asmContent.querySelector<HTMLElement>(
            `.asm-row[data-source-line="${srcLine}"]`
          );
          if (firstAsmRow) {
            firstAsmRow.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }
        }
      });
    });
  };

  // Compile and fetch RISC-V 64 assembly
  const loadAssembly = async () => {
    if (isLoading) return;
    isLoading = true;

    btnRefresh.disabled = true;
    asmStatusBadge.innerHTML = `${SPINNER_ICON} 生成中...`;
    asmContent.innerHTML = `
      <div class="flex flex-col items-center justify-center p-8 text-center text-muted-foreground font-mono text-xs">
        ${SPINNER_ICON}
        <span class="mt-2 text-foreground/80">正在向 Compiler Explorer 请求 RISC-V 64 汇编...</span>
        <span class="text-[11px] text-muted-foreground/70 mt-1">${selectPreset.value}</span>
      </div>
    `;

    try {
      const result = await compileCppToAssembly(currentSource, currentLang, {
        userArguments: selectPreset.value,
      });

      if (result.success && result.asmLines && result.asmLines.length > 0) {
        currentAsmLines = result.asmLines;
        currentAsmText = result.asm || "";
        asmContent.innerHTML = renderAsmPaneHtml(currentAsmLines);
        asmStatusBadge.innerText = `${currentAsmLines.length} 行汇编 (${result.durationMs}ms)`;
        setupLineHoverLink();
      } else {
        const errorText =
          result.error || result.stderr || "未能生成汇编代码或编译失败";
        asmStatusBadge.innerText = "编译失败";
        asmContent.innerHTML = `
          <div class="p-4 text-rose-400 font-mono text-xs leading-relaxed whitespace-pre-wrap">
[汇编编译失败]
${errorText}
          </div>
        `;
      }
    } catch (err: any) {
      asmStatusBadge.innerText = "异常";
      asmContent.innerHTML = `
        <div class="p-4 text-rose-400 font-mono text-xs whitespace-pre-wrap">
网络或服务请求异常: ${err.message || String(err)}
        </div>
      `;
    } finally {
      isLoading = false;
      btnRefresh.disabled = false;
    }
  };

  // Re-generate / refresh button
  btnRefresh?.addEventListener("click", async () => {
    if (getLatestCode) {
      currentSource = getLatestCode();
      sourceContent.innerHTML = renderSourcePaneHtml(currentSource);
    }
    await loadAssembly();
  });

  // Preset option changed -> recompile
  selectPreset?.addEventListener("change", () => {
    if (currentSource) {
      loadAssembly();
    }
  });

  // Open inspector method
  const open = async (sourceCode: string, lang: "c" | "cpp") => {
    currentSource = sourceCode;
    currentLang = lang;

    // Adapt preset options for C vs C++
    if (lang === "c") {
      selectPreset.innerHTML = `
        <option value="-O2 -std=c23 -lm" selected>-O2 (C23 标准优化)</option>
        <option value="-O3 -std=c23 -march=rv64gcv -lm">-O3 + RVV (向量扩展)</option>
        <option value="-O1 -std=c23 -lm">-O1 (基础指令)</option>
        <option value="-O0 -std=c23 -lm">-O0 (无优化直译)</option>
      `;
    } else {
      selectPreset.innerHTML = `
        <option value="-O2 -std=c++23 -pthread" selected>-O2 (C++23 标准优化)</option>
        <option value="-O3 -std=c++23 -march=rv64gcv -pthread">-O3 + RVV (向量扩展)</option>
        <option value="-O1 -std=c++23 -pthread">-O1 (基础指令)</option>
        <option value="-O0 -std=c++23 -pthread">-O0 (无优化直译)</option>
      `;
    }

    // Render source view
    sourceContent.innerHTML = renderSourcePaneHtml(sourceCode);

    container.classList.remove("hidden");
    handleResize();

    // Fetch and render assembly
    await loadAssembly();
  };

  return {
    open,
    close,
    isOpen: () => !container.classList.contains("hidden"),
  };
}
