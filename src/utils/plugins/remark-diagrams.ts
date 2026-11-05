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
  return `<div class="diagram-toolbar absolute top-3 right-3 flex items-center gap-1 opacity-95 sm:opacity-85 sm:hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-10 rounded-full border border-border/70 bg-surface/90 dark:bg-surface/80 p-1 shadow-xs backdrop-blur-md">
    <div class="diagram-zoom-controls flex items-center gap-1">
      <button type="button" class="diagram-btn-zoom-in rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer" title="放大 (+)" aria-label="放大">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
      </button>
      <button type="button" class="diagram-btn-zoom-out rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer" title="缩小 (-)" aria-label="缩小">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
      </button>
      <button type="button" class="diagram-btn-reset rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer" title="还原 (100%)" aria-label="还原">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </button>
      <span class="w-px h-3.5 bg-border/60 mx-0.5" aria-hidden="true"></span>
    </div>
    <button type="button" class="diagram-btn-source inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-accent hover:bg-muted/70 transition-all cursor-pointer" title="查看源码" aria-label="查看源码">
      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      <span class="diagram-btn-source-label">源码</span>
    </button>
    <button type="button" class="diagram-btn-fullscreen diagram-zoom-controls rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer" title="全屏查看" aria-label="全屏查看">
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
    </button>
  </div>`;
}

function renderDiagramSourcePanel(lang: string, escapedCode: string): string {
  const displayLang = lang.toUpperCase();
  return `<div class="diagram-source-panel hidden w-full my-2 transition-all duration-300 select-text">
    <div class="rounded-xl border border-border/80 bg-surface/90 dark:bg-surface/50 overflow-hidden shadow-xs">
      <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60 bg-surface/80 dark:bg-surface/30 text-xs select-none">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded font-mono text-[11px] font-semibold tracking-wider text-accent bg-accent/10 uppercase">
            ${displayLang}
          </span>
          <span class="text-muted-foreground text-[11px] font-medium">图表源码 (支持逐字选择复制)</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="diagram-btn-copy-source inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-accent hover:bg-muted/60 transition-colors cursor-pointer" title="复制代码" aria-label="复制代码">
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>复制代码</span>
          </button>
          <button type="button" class="diagram-btn-close-source inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer" title="返回图表" aria-label="返回图表">
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            <span>返回图表</span>
          </button>
        </div>
      </div>
      <pre class="diagram-source-pre p-4 m-0 overflow-x-auto text-xs font-mono text-foreground leading-relaxed selection:bg-accent/30 max-h-[500px] overflow-y-auto select-text cursor-text"><code class="select-text cursor-text">${escapedCode}</code></pre>
    </div>
  </div>`;
}

function renderDiagramHint(): string {
  return `<div class="diagram-hint mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/60 select-none">
    <svg class="size-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
    <span>支持鼠标拖拽平移、滚轮缩放与双击全屏预览</span>
  </div>`;
}

function parseColorToRgb(
  colorStr: string
): { r: number; g: number; b: number } | null {
  if (!colorStr || colorStr === "none" || colorStr === "transparent") return null;
  colorStr = colorStr.trim().toLowerCase();
  if (colorStr.startsWith("#")) {
    const hex = colorStr.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  const namedColors: Record<string, [number, number, number]> = {
    white: [255, 255, 255],
    lightgrey: [211, 211, 211],
    lightgray: [211, 211, 211],
    black: [0, 0, 0],
    yellow: [255, 255, 0],
  };
  if (namedColors[colorStr]) {
    const [r, g, b] = namedColors[colorStr];
    return { r, g, b };
  }
  return null;
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    const val = v / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function enhanceGraphvizSvg(svg: string): string {
  // 1. Remove graph-level opaque white background polygon if present
  svg = svg.replace(/<polygon[^>]*fill="white"[^>]*stroke="none"[^>]*\/>/i, "");

  // 2. Process clusters
  svg = svg.replace(
    /<g id="([^"]+)" class="cluster">([\s\S]*?)<\/g>/g,
    (fullMatch, id, inner) => {
      const fillMatch = inner.match(/<(?:polygon|path)[^>]*fill="([^"]+)"/);
      if (fillMatch && fillMatch[1] !== "none" && fillMatch[1] !== "transparent") {
        const rgb = parseColorToRgb(fillMatch[1]);
        if (rgb) {
          const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
          const isLight = lum > 0.42;
          const tone = isLight ? "light" : "dark";
          const textColor = isLight ? "#181d1c" : "#f7faf9";

          const updatedInner = inner.replace(
            /<text([^>]*)>([\s\S]*?)<\/text>/g,
            (_tMatch: string, attrs: string, content: string) => {
              const cleanAttrs = attrs.replace(/\s*fill="[^"]*"/g, "");
              return `<text${cleanAttrs} fill="${textColor}" class="diagram-text-${tone}">${content}</text>`;
            }
          );
          return `<g id="${id}" class="cluster" data-bg-tone="${tone}">${updatedInner}</g>`;
        }
      }
      return fullMatch;
    }
  );

  // 3. Process nodes
  svg = svg.replace(
    /<g id="([^"]+)" class="node">([\s\S]*?)<\/g>/g,
    (fullMatch, id, inner) => {
      const fillMatch = inner.match(
        /<(?:polygon|path|ellipse|circle)[^>]*fill="([^"]+)"/
      );
      if (fillMatch && fillMatch[1] !== "none" && fillMatch[1] !== "transparent") {
        const rgb = parseColorToRgb(fillMatch[1]);
        if (rgb) {
          const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
          const isLight = lum > 0.42;
          const tone = isLight ? "light" : "dark";
          const textColor = isLight ? "#181d1c" : "#f7faf9";

          const updatedInner = inner.replace(
            /<text([^>]*)>([\s\S]*?)<\/text>/g,
            (_tMatch: string, attrs: string, content: string) => {
              const cleanAttrs = attrs.replace(/\s*fill="[^"]*"/g, "");
              return `<text${cleanAttrs} fill="${textColor}" class="diagram-text-${tone}">${content}</text>`;
            }
          );
          return `<g id="${id}" class="node" data-bg-tone="${tone}">${updatedInner}</g>`;
        }
      } else {
        return `<g id="${id}" class="node node-unshaded">${inner}</g>`;
      }
      return fullMatch;
    }
  );

  // 4. Record divider polylines: black divider lines become visible in dark theme
  svg = svg.replace(/<polyline([^>]*stroke="black"[^>]*)>/g, (_match, p1) => {
    return `<polyline${p1.replace(/stroke="black"/g, 'stroke="currentColor" class="diagram-divider"')}>`;
  });

  return svg;
}

export function remarkDiagrams() {
  return async function (tree: any) {
    const nodesToProcess: Array<{ node: any; index: number; parent: any }> = [];

    visit(tree, "code", (node: any, index: any, parent: any) => {
      const lang = (node.lang || "").toLowerCase().trim();
      if (lang === "mermaid" || lang === "graphviz" || lang === "dot") {
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
          value: `<div class="diagram-wrapper mermaid-wrapper not-prose group relative my-6 flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-surface/60 dark:bg-surface/30 p-4 sm:p-6 transition-all duration-300 shadow-xs" data-diagram-wrapper data-diagram-lang="mermaid">${renderDiagramToolbar()}<div class="diagram-viewport w-full overflow-hidden flex items-center justify-center min-h-[140px] cursor-grab select-none"><div class="diagram-canvas flex items-center justify-center transition-transform duration-75"><div class="mermaid" data-source="${escapedCode}">${escapedCode}</div></div></div>${renderDiagramSourcePanel("mermaid", escapedCode)}${renderDiagramHint()}</div>`,
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
          svg = enhanceGraphvizSvg(svg);

          const escapedCode = escapeHtml(code);
          const displayLang = lang === "dot" ? "graphviz" : lang;
          parent.children[index] = {
            type: "html",
            value: `<div class="diagram-wrapper graphviz-wrapper not-prose group relative my-6 flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-surface/60 dark:bg-surface/30 p-4 sm:p-6 transition-all duration-300 shadow-xs" data-diagram-wrapper data-diagram-lang="${displayLang}">${renderDiagramToolbar()}<div class="diagram-viewport w-full overflow-hidden flex items-center justify-center min-h-[140px] cursor-grab select-none"><div class="diagram-canvas flex items-center justify-center transition-transform duration-75 [&>svg]:max-w-full [&>svg]:h-auto">${svg}</div></div>${renderDiagramSourcePanel(displayLang, escapedCode)}${renderDiagramHint()}</div>`,
          };
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.warn(
            "[remark-diagrams] Graphviz compile warning:",
            err?.message || err
          );
          parent.children[index] = {
            type: "html",
            value: `<div class="graphviz-error not-prose my-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400"><strong>Graphviz 渲染失败：</strong>${escapeHtml(err?.message || "语法解析错误")}<pre class="mt-2 text-xs opacity-75">${escapeHtml(code)}</pre></div>`,
          };
        }
      }
    }
  };
}
