import { visit } from "unist-util-visit";
import { Graphviz } from "@hpcc-js/wasm-graphviz";

let graphvizInstance: Graphviz | null = null;

async function getGraphviz(): Promise<Graphviz> {
  if (!graphvizInstance) {
    graphvizInstance = await Graphviz.load();
  }
  return graphvizInstance;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderDiagramToolbar(): string {
  return `<div class="diagram-toolbar absolute top-3 right-3 flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-10 rounded-full border border-border/70 bg-surface/90 dark:bg-surface/80 p-1 shadow-xs backdrop-blur-md">
    <button type="button" class="diagram-btn-zoom-in rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors" title="放大 (+)" aria-label="放大">
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
    </button>
    <button type="button" class="diagram-btn-zoom-out rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors" title="缩小 (-)" aria-label="缩小">
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
    </button>
    <button type="button" class="diagram-btn-reset rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors" title="还原 (100%)" aria-label="还原">
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
    </button>
    <span class="w-px h-3.5 bg-border/60 mx-0.5" aria-hidden="true"></span>
    <button type="button" class="diagram-btn-fullscreen rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors" title="全屏查看" aria-label="全屏查看">
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
    </button>
  </div>`;
}

function renderDiagramHint(): string {
  return `<div class="diagram-hint mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/60 select-none">
    <svg class="size-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
    <span>支持鼠标拖拽平移、滚轮缩放与双击全屏预览</span>
  </div>`;
}

export function remarkDiagrams() {
  return async function (tree: any) {
    const nodesToProcess: Array<{ node: any; index: number; parent: any }> = [];

    visit(tree, "code", (node: any, index: any, parent: any) => {
      const lang = (node.lang || "").toLowerCase().trim();
      if (
        lang === "mermaid" ||
        lang === "graphviz" ||
        lang === "dot"
      ) {
        nodesToProcess.push({ node, index, parent });
      }
    });

    for (const { node, index, parent } of nodesToProcess) {
      const lang = (node.lang || "").toLowerCase().trim();
      const code = node.value.trim();

      if (lang === "mermaid") {
        const escapedCode = escapeHtml(code);
        parent.children[index] = {
          type: "html",
          value: `<div class="diagram-wrapper mermaid-wrapper not-prose group relative my-6 flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-surface/60 dark:bg-surface/30 p-4 sm:p-6 transition-all duration-300 shadow-xs" data-diagram-wrapper>${renderDiagramToolbar()}<div class="diagram-viewport w-full overflow-hidden flex items-center justify-center min-h-[140px] cursor-grab select-none"><div class="diagram-canvas flex items-center justify-center transition-transform duration-75"><div class="mermaid" data-source="${escapedCode}">${escapedCode}</div></div></div>${renderDiagramHint()}</div>`,
        };
      } else if (lang === "graphviz" || lang === "dot") {
        try {
          const g = await getGraphviz();
          let dotInput = code;
          if (!dotInput.includes("bgcolor")) {
            dotInput = dotInput.replace(
              /(strict\s+)?(di)?graph\s*([^{]*)\{/i,
              '$1$2graph $3{\n  bgcolor="transparent";'
            );
          }
          let svg = g.dot(dotInput);
          svg = svg
            .replace(/<\?xml[^>]*\?>/i, "")
            .replace(/<!DOCTYPE[^>]*>/i, "")
            .trim();

          parent.children[index] = {
            type: "html",
            value: `<div class="diagram-wrapper graphviz-wrapper not-prose group relative my-6 flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-surface/60 dark:bg-surface/30 p-4 sm:p-6 transition-all duration-300 shadow-xs" data-diagram-wrapper>${renderDiagramToolbar()}<div class="diagram-viewport w-full overflow-hidden flex items-center justify-center min-h-[140px] cursor-grab select-none"><div class="diagram-canvas flex items-center justify-center transition-transform duration-75 [&>svg]:max-w-full [&>svg]:h-auto">${svg}</div></div>${renderDiagramHint()}</div>`,
          };
        } catch (err: any) {
          console.warn("[remark-diagrams] Graphviz compile warning:", err?.message || err);
          parent.children[index] = {
            type: "html",
            value: `<div class="graphviz-error not-prose my-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400"><strong>Graphviz 渲染失败：</strong>${escapeHtml(err?.message || "语法解析错误")}<pre class="mt-2 text-xs opacity-75">${escapeHtml(code)}</pre></div>`,
          };
        }
      }
    }
  };
}
