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
          value: `<div class="mermaid-wrapper not-prose my-6 flex flex-col items-center justify-center overflow-x-auto rounded-2xl border border-border/70 bg-surface/60 dark:bg-surface/30 p-6 transition-all duration-300 shadow-xs"><div class="mermaid" data-source="${escapedCode}">${escapedCode}</div></div>`,
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
            value: `<div class="graphviz-wrapper not-prose my-6 flex flex-col items-center justify-center overflow-x-auto rounded-2xl border border-border/70 bg-surface/60 dark:bg-surface/30 p-6 transition-all duration-300 shadow-xs [&>svg]:max-w-full [&>svg]:h-auto">${svg}</div>`,
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
