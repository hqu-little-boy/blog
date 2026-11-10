import { runPythonCode } from "./pyodide-engine";
import { runCppCode } from "./emscripten-engine";
import type { SupportedLanguage, RunnerStatus } from "./types";

const PLAY_ICON = `<svg class="size-3.5 inline-block me-1 text-emerald-500 dark:text-emerald-400" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const SPINNER_ICON = `<svg class="size-3.5 inline-block me-1 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

/**
 * Determine supported language from codeblock metadata or class.
 */
function detectLanguage(codeBlock: HTMLElement): SupportedLanguage | null {
  const langAttr = (
    codeBlock.getAttribute("data-language") || ""
  ).toLowerCase();
  const classList = codeBlock.className.toLowerCase();

  if (
    langAttr === "python" ||
    langAttr === "py" ||
    classList.includes("language-python") ||
    classList.includes("language-py")
  ) {
    return "python";
  }
  if (
    langAttr === "cpp" ||
    langAttr === "c++" ||
    classList.includes("language-cpp") ||
    classList.includes("language-c++")
  ) {
    return "cpp";
  }
  if (
    langAttr === "c" ||
    classList.includes("language-c ") ||
    classList.endsWith("language-c")
  ) {
    return "c";
  }

  return null;
}

/**
 * Extract pure plain text from code block.
 */
function getCodeText(codeBlock: HTMLElement): string {
  const codeEl = codeBlock.querySelector("code");
  if (!codeEl) return codeBlock.innerText || "";

  // Clone to avoid picking up auxiliary tags
  const clone = codeEl.cloneNode(true) as HTMLElement;
  const auxElements = clone.querySelectorAll(
    ".copy-code, .run-code-btn, .code-runner-console, .file-name, .lang-tag"
  );
  auxElements.forEach(el => el.remove());

  return clone.innerText || "";
}

/**
 * Mount runner button and terminal console to eligible code blocks.
 */
export function setupInteractiveCodeBlocks() {
  const codeBlocks = Array.from(
    document.querySelectorAll<HTMLElement>(
      "pre:not(.mermaid):not(.diagram-source-pre)"
    )
  );

  for (const codeBlock of codeBlocks) {
    if (codeBlock.dataset.runnerAttached === "true") continue;

    const lang = detectLanguage(codeBlock);
    if (!lang) continue;

    codeBlock.dataset.runnerAttached = "true";

    const originalCode = getCodeText(codeBlock);

    // Ensure codeBlock has a relative wrapper container
    let wrapper = codeBlock.parentElement;
    const isAlreadyWrapped =
      wrapper &&
      (wrapper.classList.contains("code-block-wrapper") ||
        wrapper.style.position === "relative");

    if (!isAlreadyWrapped || !wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper relative my-6";
      codeBlock.parentNode?.insertBefore(wrapper, codeBlock);
      wrapper.appendChild(codeBlock);
    } else {
      wrapper.classList.add("code-block-wrapper");
    }

    const computedStyle = getComputedStyle(codeBlock);
    const hasFileNameOffset =
      computedStyle.getPropertyValue("--file-name-offset").trim() !== "";
    const topClass = hasFileNameOffset
      ? "top-(--file-name-offset)"
      : "-top-3.5";

    // Create Runner Button
    const runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = `run-code-btn absolute end-20 ${topClass} rounded-full border border-emerald-500/50 bg-surface/95 dark:bg-surface px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 shadow-xs hover:bg-emerald-500/15 hover:border-emerald-500 transition-all duration-200 inline-flex items-center select-none cursor-pointer z-10`;

    const labelText =
      lang === "python" ? "运行 (Pyodide)" : "运行 (C/C++)";
    runBtn.innerHTML = `${PLAY_ICON}<span class="hidden sm:inline">${labelText}</span><span class="sm:hidden">运行</span>`;
    codeBlock.appendChild(runBtn);

    // Create Interactive Console Container
    const consoleContainer = document.createElement("div");
    consoleContainer.className =
      "code-runner-console hidden mt-2 mb-6 rounded-2xl border border-border/80 bg-surface-container-low/95 dark:bg-surface-container-low/80 p-4 shadow-sm backdrop-blur-md transition-all duration-300";

    consoleContainer.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5 mb-2.5 text-xs select-none">
        <div class="flex items-center gap-2">
          <span class="status-indicator size-2.5 rounded-full bg-emerald-500 inline-block transition-colors"></span>
          <span class="status-text font-medium text-foreground/90">控制台就绪</span>
          <span class="engine-badge rounded-md px-1.5 py-0.5 text-[10px] font-mono font-semibold tracking-wider text-muted-foreground bg-muted/60">
            ${lang === "python" ? "Pyodide WASM (客户端算力)" : "WebAssembly / 本地算力"}
          </span>
        </div>
        <div class="flex items-center gap-1.5 text-xs">
          <button type="button" class="btn-edit-code rounded-lg px-2 py-0.5 text-muted-foreground hover:text-accent hover:bg-muted/60 transition-colors cursor-pointer" title="直接在上方修改代码试验不同参数">
            ✏️ 编辑代码
          </button>
          <button type="button" class="btn-reset-code rounded-lg px-2 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer" title="还原代码为原文">
            ↺ 恢复
          </button>
          <button type="button" class="btn-clear-output rounded-lg px-2 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer" title="清空输出内容">
            🗑 清空
          </button>
          <button type="button" class="btn-close-console rounded-lg px-2 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer" title="收起控制台">
            ✕ 收起
          </button>
        </div>
      </div>
      <div class="terminal-body relative rounded-xl bg-[#0f1115] text-[#e3e2e6] p-3.5 font-mono text-xs leading-relaxed max-h-[360px] overflow-y-auto selection:bg-emerald-500/30">
        <pre class="terminal-output m-0 whitespace-pre-wrap font-mono text-[11.5px]"></pre>
      </div>
    `;

    wrapper.appendChild(consoleContainer);

    const statusIndicator = consoleContainer.querySelector(
      ".status-indicator"
    ) as HTMLElement;
    const statusText = consoleContainer.querySelector(
      ".status-text"
    ) as HTMLElement;
    const terminalOutput = consoleContainer.querySelector(
      ".terminal-output"
    ) as HTMLElement;
    const btnEdit = consoleContainer.querySelector(
      ".btn-edit-code"
    ) as HTMLButtonElement;
    const btnReset = consoleContainer.querySelector(
      ".btn-reset-code"
    ) as HTMLButtonElement;
    const btnClear = consoleContainer.querySelector(
      ".btn-clear-output"
    ) as HTMLButtonElement;
    const btnClose = consoleContainer.querySelector(
      ".btn-close-console"
    ) as HTMLButtonElement;

    let isEditing = false;
    let isRunning = false;
    const codeEl = codeBlock.querySelector("code");

    // Clear output
    btnClear?.addEventListener("click", () => {
      if (terminalOutput) terminalOutput.innerHTML = "";
    });

    // Close console
    btnClose?.addEventListener("click", () => {
      consoleContainer.classList.add("hidden");
    });

    // Toggle editable code
    btnEdit?.addEventListener("click", () => {
      if (!codeEl) return;
      isEditing = !isEditing;
      if (isEditing) {
        codeEl.setAttribute("contenteditable", "true");
        codeEl.classList.add(
          "outline-none",
          "ring-2",
          "ring-accent/40",
          "rounded-md"
        );
        codeEl.focus();
        btnEdit.innerHTML = "💾 完成编辑";
        btnEdit.classList.add("text-accent", "font-medium");
      } else {
        codeEl.removeAttribute("contenteditable");
        codeEl.classList.remove(
          "outline-none",
          "ring-2",
          "ring-accent/40",
          "rounded-md"
        );
        btnEdit.innerHTML = "✏️ 编辑代码";
        btnEdit.classList.remove("text-accent", "font-medium");
      }
    });

    // Reset code to initial
    btnReset?.addEventListener("click", () => {
      if (!codeEl) return;
      codeEl.innerText = originalCode;
      if (isEditing) {
        isEditing = false;
        codeEl.removeAttribute("contenteditable");
        codeEl.classList.remove(
          "outline-none",
          "ring-2",
          "ring-accent/40",
          "rounded-md"
        );
        btnEdit.innerHTML = "✏️ 编辑代码";
        btnEdit.classList.remove("text-accent", "font-medium");
      }
      if (statusText) statusText.innerText = "代码已还原";
    });

    // Execute code handler
    const handleRun = async () => {
      if (isRunning) return;
      isRunning = true;

      consoleContainer.classList.remove("hidden");
      runBtn.innerHTML = `${SPINNER_ICON}<span>执行中...</span>`;
      runBtn.disabled = true;

      statusIndicator.className =
        "status-indicator size-2.5 rounded-full bg-amber-500 animate-pulse inline-block";
      statusText.innerText = "准备运行...";

      terminalOutput.innerHTML = `<span class="text-muted-foreground/70">$ [${lang.toUpperCase()}] 启动执行...</span>\n`;

      const currentCode = getCodeText(codeBlock);

      const onStatusChange = (status: RunnerStatus, msg: string) => {
        statusText.innerText = msg;
        if (status === "loading_engine" || status === "running") {
          statusIndicator.className =
            "status-indicator size-2.5 rounded-full bg-amber-500 animate-pulse inline-block";
        } else if (status === "success") {
          statusIndicator.className =
            "status-indicator size-2.5 rounded-full bg-emerald-500 inline-block";
        } else if (status === "error") {
          statusIndicator.className =
            "status-indicator size-2.5 rounded-full bg-rose-500 inline-block";
        }
      };

      const appendStdout = (chunk: string) => {
        const span = document.createElement("span");
        span.className = "text-[#e3e2e6]";
        span.textContent = chunk;
        terminalOutput.appendChild(span);
        terminalOutput.parentElement?.scrollTo({
          top: terminalOutput.parentElement.scrollHeight,
          behavior: "smooth",
        });
      };

      const appendStderr = (chunk: string) => {
        const span = document.createElement("span");
        span.className = "text-rose-400 font-semibold";
        span.textContent = chunk;
        terminalOutput.appendChild(span);
        terminalOutput.parentElement?.scrollTo({
          top: terminalOutput.parentElement.scrollHeight,
          behavior: "smooth",
        });
      };

      try {
        if (lang === "python") {
          await runPythonCode(currentCode, {
            onStdout: appendStdout,
            onStderr: appendStderr,
            onStatusChange,
          });
        } else {
          const targetLang: "c" | "cpp" = lang === "c" ? "c" : "cpp";
          await runCppCode(currentCode, targetLang, {
            onStdout: appendStdout,
            onStderr: appendStderr,
            onStatusChange,
          });
        }
      } catch (err: any) {
        appendStderr("\n执行出现未捕获异常: " + (err?.message || String(err)));
      } finally {
        isRunning = false;
        runBtn.innerHTML = `${PLAY_ICON}<span>${labelText}</span>`;
        runBtn.disabled = false;
      }
    };

    runBtn.addEventListener("click", handleRun);
  }
}
