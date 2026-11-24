import type { AsmLineItem } from "./types";

/**
 * RISC-V 64 Assembly Syntax Highlighter & Dual-Pane Renderer.
 * Zero-dependency, ultra-fast client-side tokenizer tailored for RISC-V architecture.
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Regex for RISC-V registers (ABI names, numeric names, vector & floating point registers)
const REG_REGEX =
  /\b(zero|ra|sp|gp|tp|t[0-6]|s[0-9]|s1[0-1]|fp|a[0-7]|x[0-9]|x[1-2][0-9]|x3[0-1]|ft[0-9]|ft1[0-1]|fs[0-9]|fs1[0-1]|fa[0-7]|f[0-9]|f[1-2][0-9]|f3[0-1]|v[0-9]|v[1-2][0-9]|v3[0-1]|vl|vtype|vlenb|e[0-9]+|m[0-9]+|mf[0-9]+|ta|tu|ma|mu)\b/gi;

/**
 * Tokenize and syntax-highlight a single line of RISC-V assembly code.
 */
export function highlightRiscvAsmLine(line: string): string {
  if (!line || !line.trim()) return "&nbsp;";

  let comment = "";
  let code = line;

  // Split comments (starting with ;, #, or //)
  const commentMatch = line.match(/(;|#|\/\/)/);
  if (commentMatch && commentMatch.index !== undefined) {
    const idx = commentMatch.index;
    comment = line.slice(idx);
    code = line.slice(0, idx);
  }

  let codeHtml = "";

  // 1. Check for Label definition (e.g. `main:`, `.L3:`, `square(int):`)
  const labelMatch = code.match(/^(\s*)([a-zA-Z0-9_.$()<>, ]+:)(.*)$/);
  if (labelMatch) {
    const [, indent, label, rest] = labelMatch;
    codeHtml +=
      escapeHtml(indent) +
      `<span class="asm-token-label text-purple-400 dark:text-purple-300 font-bold">${escapeHtml(label)}</span>` +
      escapeHtml(rest);
  } else {
    // 2. Check for Instruction or Directive + Operands
    const instMatch = code.match(/^(\s*)([a-zA-Z0-9_.]+)(?:[ \t]+(.*))?$/);
    if (instMatch) {
      const [, indent, inst, operands] = instMatch;
      const isDirective = inst.startsWith(".");
      const instClass = isDirective
        ? "asm-token-directive text-rose-400 dark:text-rose-300 font-medium"
        : "asm-token-inst text-sky-400 dark:text-sky-300 font-semibold";

      codeHtml +=
        escapeHtml(indent) +
        `<span class="${instClass}">${escapeHtml(inst)}</span>`;

      if (operands) {
        let opHtml = escapeHtml(operands);

        // Highlight relocation macros: %hi, %lo, %pcrel_hi, etc.
        opHtml = opHtml.replace(
          /(%[a-zA-Z_]+)/g,
          `<span class="asm-token-macro text-indigo-400 dark:text-indigo-300 font-mono">$1</span>`
        );

        // Highlight numbers, offsets, and hex constants
        opHtml = opHtml.replace(
          /\b(0x[0-9a-fA-F]+|-?\d+)\b/g,
          `<span class="asm-token-num text-emerald-400 dark:text-emerald-300 font-mono">$1</span>`
        );

        // Highlight registers
        opHtml = opHtml.replace(
          REG_REGEX,
          `<span class="asm-token-reg text-amber-300 dark:text-amber-200 font-medium">$1</span>`
        );

        // Highlight local label references: .L1, .L3
        opHtml = opHtml.replace(
          /\b(\.L[a-zA-Z0-9_]+)\b/g,
          `<span class="asm-token-target text-purple-300 dark:text-purple-200 underline decoration-purple-400/40 underline-offset-2">$1</span>`
        );

        codeHtml += " " + opHtml;
      }
    } else {
      codeHtml = escapeHtml(code);
    }
  }

  if (comment) {
    codeHtml += `<span class="asm-token-comment text-zinc-500 dark:text-zinc-400 italic">${escapeHtml(comment)}</span>`;
  }

  return codeHtml;
}

/**
 * Render the Assembly Pane HTML with line numbers and data attributes for linked highlighting.
 */
export function renderAsmPaneHtml(asmLines: AsmLineItem[]): string {
  if (!asmLines || asmLines.length === 0) {
    return `<div class="p-6 text-center text-muted-foreground font-mono text-xs">暂无汇编指令输出</div>`;
  }

  return asmLines
    .map((item, idx) => {
      const lineNo = idx + 1;
      const srcLine = item.sourceLine != null ? item.sourceLine : "";
      const highlighted = highlightRiscvAsmLine(item.text);

      return `
        <div
          class="asm-row group flex items-baseline hover:bg-sky-500/10 transition-colors px-2.5 py-[2px] rounded select-text cursor-pointer"
          data-asm-line="${lineNo}"
          data-source-line="${srcLine}"
          title="${srcLine ? `源自 C++ 源码第 ${srcLine} 行` : ""}"
        >
          <span class="asm-lineno select-none w-9 shrink-0 text-right pr-3 text-zinc-600 dark:text-zinc-500 font-mono text-[11px] group-hover:text-sky-400 transition-colors">${lineNo}</span>
          <span class="asm-code font-mono text-[12px] leading-relaxed text-[#e3e2e6] whitespace-pre">${highlighted}</span>
        </div>
      `.trim();
    })
    .join("\n");
}

/**
 * Render the Source Code Pane HTML with line numbers and line data attributes for linked highlighting.
 */
export function renderSourcePaneHtml(sourceCode: string): string {
  const lines = sourceCode.split(/\r?\n/);

  return lines
    .map((line, idx) => {
      const lineNo = idx + 1;
      const safeLine = line.trim() === "" ? "&nbsp;" : escapeHtml(line);

      return `
        <div
          class="source-row group flex items-baseline hover:bg-sky-500/10 transition-colors px-2.5 py-[2px] rounded select-text cursor-pointer"
          data-source-line="${lineNo}"
        >
          <span class="source-lineno select-none w-9 shrink-0 text-right pr-3 text-zinc-600 dark:text-zinc-500 font-mono text-[11px] group-hover:text-emerald-400 transition-colors">${lineNo}</span>
          <span class="source-code font-mono text-[12px] leading-relaxed text-[#e3e2e6] whitespace-pre">${safeLine}</span>
        </div>
      `.trim();
    })
    .join("\n");
}
