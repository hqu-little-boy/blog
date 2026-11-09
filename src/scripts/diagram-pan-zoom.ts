/**
 * Client-side pan, zoom, and fullscreen lightbox for Mermaid & Graphviz diagrams.
 * Supports mouse drag, wheel zoom, touch pinch-to-zoom, and fullscreen modal inspection.
 * Works seamlessly with Astro View Transitions.
 */
import { fixDiagramContrast, fixAllDiagramsContrast } from "./diagram-contrast";

interface DiagramState {
  scale: number;
  translateX: number;
  translateY: number;
  isDragging: boolean;
  startX: number;
  startY: number;
  startTranslateX: number;
  startTranslateY: number;
}

let activeModal: HTMLElement | null = null;
let closeModalHandler: (() => void) | null = null;

/**
 * Accurately finds the diagram SVG inside a wrapper, strictly ignoring toolbar and hint icons.
 */
function getDiagramSvg(wrapper: HTMLElement): SVGElement | null {
  // 1. Direct canvas/viewport/mermaid child svg
  const canvasSvg = wrapper.querySelector<SVGElement>(".diagram-canvas svg");
  if (canvasSvg && !canvasSvg.closest(".diagram-toolbar, .diagram-hint"))
    return canvasSvg;

  const mermaidSvg = wrapper.querySelector<SVGElement>(".mermaid svg");
  if (mermaidSvg && !mermaidSvg.closest(".diagram-toolbar, .diagram-hint"))
    return mermaidSvg;

  const viewportSvg = wrapper.querySelector<SVGElement>(
    ".diagram-viewport svg"
  );
  if (viewportSvg && !viewportSvg.closest(".diagram-toolbar, .diagram-hint"))
    return viewportSvg;

  // 2. Fallback: find any SVG that does NOT belong to toolbar or hint
  const allSvgs = Array.from(wrapper.querySelectorAll<SVGElement>("svg"));
  const diagramSvg = allSvgs.find(
    s => !s.closest(".diagram-toolbar, .diagram-hint")
  );
  return diagramSvg ?? null;
}

function applyTransform(canvas: HTMLElement, state: DiagramState) {
  canvas.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
  canvas.style.transformOrigin = "center center";
}

function resetTransform(canvas: HTMLElement, state: DiagramState) {
  state.scale = 1;
  state.translateX = 0;
  state.translateY = 0;
  canvas.style.transform = "";
}

/**
 * Initializes pan and zoom on an in-page diagram wrapper.
 */
function initDiagramWrapper(wrapper: HTMLElement) {
  if (wrapper.dataset.panZoomInit === "true") {
    fixDiagramContrast(wrapper);
    return;
  }
  wrapper.dataset.panZoomInit = "true";
  fixDiagramContrast(wrapper);

  let viewport = wrapper.querySelector<HTMLElement>(".diagram-viewport");
  let canvas = wrapper.querySelector<HTMLElement>(".diagram-canvas");

  // If wrapper didn't have viewport/canvas structure, wrap its SVG or mermaid container
  if (!viewport || !canvas) {
    const target = wrapper.querySelector(".mermaid") || getDiagramSvg(wrapper);
    if (!target) return;

    viewport = document.createElement("div");
    viewport.className =
      "diagram-viewport w-full overflow-hidden flex items-center justify-center min-h-[140px] cursor-grab select-none";
    canvas = document.createElement("div");
    canvas.className =
      "diagram-canvas flex items-center justify-center transition-transform duration-75";

    target.parentNode?.insertBefore(viewport, target);
    canvas.appendChild(target);
    viewport.appendChild(canvas);
  }

  // If toolbar is missing, inject it dynamically
  let toolbar = wrapper.querySelector<HTMLElement>(".diagram-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className =
      "diagram-toolbar absolute top-3 right-3 flex items-center gap-1 opacity-95 sm:opacity-85 sm:hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-10 rounded-full border border-border/70 bg-surface/90 dark:bg-surface/80 p-1 shadow-xs backdrop-blur-md";
    toolbar.innerHTML = `
      <div class="diagram-zoom-controls flex items-center gap-1">
        <button type="button" class="diagram-btn-zoom-in rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer" title="放大 (+)" aria-label="放大">
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button type="button" class="diagram-btn-zoom-out rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer" title="缩小 (-)" aria-label="缩小">
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button type="button" class="diagram-btn-reset rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer" title="还原 (100%)" aria-label="还原">
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        <span class="w-px h-3.5 bg-border/60 mx-0.5" aria-hidden="true"></span>
      </div>
      <button type="button" class="diagram-btn-source rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer" title="查看源码" aria-label="查看源码">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </button>
      <button type="button" class="diagram-btn-fullscreen diagram-zoom-controls rounded-full p-1.5 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer" title="全屏查看" aria-label="全屏查看">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
      </button>
    `;
    wrapper.style.position = "relative";
    wrapper.prepend(toolbar);
  }

  let hint = wrapper.querySelector<HTMLElement>(".diagram-hint");
  if (!hint) {
    hint = document.createElement("div");
    hint.className =
      "diagram-hint mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/60 select-none";
    hint.innerHTML = `
      <svg class="size-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
      <span>支持鼠标拖拽平移、滚轮缩放与双击全屏预览</span>
    `;
    wrapper.appendChild(hint);
  }

  const state: DiagramState = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    startTranslateX: 0,
    startTranslateY: 0,
  };

  // Attach toolbar button events
  const btnZoomIn = wrapper.querySelector(".diagram-btn-zoom-in");
  const btnZoomOut = wrapper.querySelector(".diagram-btn-zoom-out");
  const btnReset = wrapper.querySelector(".diagram-btn-reset");
  const btnSource = wrapper.querySelector<HTMLButtonElement>(
    ".diagram-btn-source"
  );
  const btnFullscreen = wrapper.querySelector(".diagram-btn-fullscreen");
  const sourcePanel = wrapper.querySelector<HTMLElement>(
    ".diagram-source-panel"
  );

  if (btnSource && sourcePanel) {
    const btnCopy = sourcePanel.querySelector<HTMLButtonElement>(
      ".diagram-btn-copy-source"
    );
    const btnClose = sourcePanel.querySelector<HTMLButtonElement>(
      ".diagram-btn-close-source"
    );
    const codeEl = sourcePanel.querySelector("code");
    const zoomControls = wrapper.querySelectorAll<HTMLElement>(
      ".diagram-zoom-controls"
    );

    const codeIconSvg = `<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    const chartIconSvg = `<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`;

    const setSourceVisible = (show: boolean) => {
      if (show) {
        sourcePanel.classList.remove("hidden");
        viewport?.classList.add("hidden");
        hint?.classList.add("hidden");
        zoomControls.forEach(el => el.classList.add("hidden"));

        btnSource.classList.add("text-accent", "bg-accent/15");
        btnSource.title = "返回图表预览";
        btnSource.setAttribute("aria-label", "返回图表预览");
        btnSource.innerHTML = chartIconSvg;
      } else {
        sourcePanel.classList.add("hidden");
        viewport?.classList.remove("hidden");
        hint?.classList.remove("hidden");
        zoomControls.forEach(el => el.classList.remove("hidden"));

        btnSource.classList.remove("text-accent", "bg-accent/15");
        btnSource.title = "查看源码";
        btnSource.setAttribute("aria-label", "查看源码");
        btnSource.innerHTML = codeIconSvg;
      }
    };

    btnSource.addEventListener("click", e => {
      e.stopPropagation();
      const isHidden = sourcePanel.classList.contains("hidden");
      setSourceVisible(isHidden);
    });

    btnClose?.addEventListener("click", e => {
      e.stopPropagation();
      setSourceVisible(false);
    });

    btnCopy?.addEventListener("click", async e => {
      e.stopPropagation();
      const text = codeEl?.textContent || "";
      await navigator.clipboard.writeText(text);

      const originalHtml = btnCopy.innerHTML;
      btnCopy.innerHTML = `
        <svg class="size-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
        <span class="text-accent">已复制</span>
      `;
      btnCopy.classList.add("text-accent");

      setTimeout(() => {
        btnCopy.innerHTML = originalHtml;
        btnCopy.classList.remove("text-accent");
      }, 2000);
    });
  }

  btnZoomIn?.addEventListener("click", e => {
    e.stopPropagation();
    state.scale = Math.min(state.scale * 1.25, 5);
    applyTransform(canvas!, state);
    if (viewport) viewport.style.cursor = state.scale > 1 ? "grab" : "default";
  });

  btnZoomOut?.addEventListener("click", e => {
    e.stopPropagation();
    state.scale = Math.max(state.scale / 1.25, 0.4);
    applyTransform(canvas!, state);
    if (viewport) viewport.style.cursor = state.scale > 1 ? "grab" : "default";
  });

  btnReset?.addEventListener("click", e => {
    e.stopPropagation();
    resetTransform(canvas!, state);
    if (viewport) viewport.style.cursor = "default";
  });

  btnFullscreen?.addEventListener("click", e => {
    e.stopPropagation();
    openFullscreenDiagram(wrapper);
  });

  // Double click opens fullscreen
  viewport.addEventListener("dblclick", e => {
    e.preventDefault();
    openFullscreenDiagram(wrapper);
  });

  // Mouse wheel zoom
  viewport.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      // Zoom if already zoomed in, or if user is holding Ctrl/Meta, or if shiftKey
      if (state.scale > 1 || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        state.scale = Math.min(Math.max(state.scale * factor, 0.4), 6);
        applyTransform(canvas!, state);
        viewport!.style.cursor = state.scale > 1 ? "grab" : "default";
      }
    },
    { passive: false }
  );

  // Mouse Drag / Pan
  viewport.addEventListener("mousedown", (e: MouseEvent) => {
    // Only left click
    if (e.button !== 0) return;
    state.isDragging = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.startTranslateX = state.translateX;
    state.startTranslateY = state.translateY;
    viewport!.style.cursor = "grabbing";

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!state.isDragging) return;
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;

      // Only pan if scale > 1 or moved more than threshold
      if (Math.hypot(dx, dy) > 3) {
        state.translateX = state.startTranslateX + dx;
        state.translateY = state.startTranslateY + dy;
        applyTransform(canvas!, state);
      }
    };

    const onMouseUp = () => {
      state.isDragging = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (viewport) {
        viewport.style.cursor = state.scale > 1 ? "grab" : "default";
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  // Touch Support (drag and pinch zoom)
  let initialDist = 0;
  let initialScale = 1;

  viewport.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        initialDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        initialScale = state.scale;
      } else if (e.touches.length === 1 && state.scale > 1) {
        state.isDragging = true;
        state.startX = e.touches[0].clientX;
        state.startY = e.touches[0].clientY;
        state.startTranslateX = state.translateX;
        state.startTranslateY = state.translateY;
      }
    },
    { passive: false }
  );

  viewport.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDist > 0) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        state.scale = Math.min(
          Math.max(initialScale * (dist / initialDist), 0.5),
          6
        );
        applyTransform(canvas!, state);
      } else if (
        e.touches.length === 1 &&
        state.isDragging &&
        state.scale > 1
      ) {
        e.preventDefault();
        const dx = e.touches[0].clientX - state.startX;
        const dy = e.touches[0].clientY - state.startY;
        state.translateX = state.startTranslateX + dx;
        state.translateY = state.startTranslateY + dy;
        applyTransform(canvas!, state);
      }
    },
    { passive: false }
  );

  viewport.addEventListener("touchend", () => {
    state.isDragging = false;
    initialDist = 0;
  });
}

/**
 * Opens a diagram in a full-screen interactive modal with unlimited pan and zoom.
 */
function openFullscreenDiagram(wrapper: HTMLElement) {
  if (activeModal) return;

  const originalSvg = getDiagramSvg(wrapper);
  if (!originalSvg) return;

  // Clone SVG - keep ID intact so Mermaid internal CSS (#id selectors) and markers work properly!
  const clonedSvg = originalSvg.cloneNode(true) as SVGElement;

  // Extract native viewBox dimensions or fallback to bounding client rect
  const viewBox = originalSvg.getAttribute("viewBox");
  let naturalW = 800;
  let naturalH = 500;

  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      naturalW = parts[2];
      naturalH = parts[3];
    }
  } else {
    const rect = originalSvg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      naturalW = rect.width;
      naturalH = rect.height;
    }
  }

  // Calculate initial responsive display size: fit comfortably inside 88vw and 78vh
  const availableW = window.innerWidth * 0.88;
  const availableH = Math.max(window.innerHeight - 90, 200) * 0.82;
  const aspect = naturalW / naturalH;

  let initialW = availableW;
  let initialH = initialW / aspect;

  if (initialH > availableH) {
    initialH = availableH;
    initialW = initialH * aspect;
  }

  // Set explicit dimensions on cloned SVG so it NEVER collapses to 0 in flexbox
  clonedSvg.style.width = `${Math.round(initialW)}px`;
  clonedSvg.style.height = `${Math.round(initialH)}px`;
  clonedSvg.style.maxWidth = "none";
  clonedSvg.style.maxHeight = "none";
  clonedSvg.style.display = "block";
  clonedSvg.style.overflow = "visible";
  fixDiagramContrast(clonedSvg);

  // Create modal backdrop
  const modal = document.createElement("div");
  modal.className =
    "diagram-fullscreen-modal fixed inset-0 z-50 flex flex-col bg-background/95 dark:bg-[#121316]/95 backdrop-blur-xl opacity-0 transition-opacity duration-200 select-none";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "图表全屏放大查看");

  // Top header bar
  const header = document.createElement("div");
  header.className =
    "flex items-center justify-between px-4 py-3 sm:px-6 border-b border-border/60 bg-surface/80 dark:bg-surface/50 backdrop-blur-md";

  const titleGroup = document.createElement("div");
  titleGroup.className =
    "flex items-center gap-2.5 sm:gap-3 text-xs sm:text-sm text-foreground";
  titleGroup.innerHTML = `
    <span class="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 font-semibold text-accent">
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
      <span>图表全屏交互模式</span>
    </span>
    <span class="text-muted-foreground hidden md:inline">· 滚轮自由缩放 · 鼠标拖拽平移 · 按 Esc 退出</span>
  `;

  // Controls bar
  const controls = document.createElement("div");
  controls.className = "flex items-center gap-1.5 sm:gap-2";

  const zoomBadge = document.createElement("span");
  zoomBadge.className =
    "min-w-14 text-center rounded-full bg-muted/80 px-2.5 py-1 text-xs font-mono font-medium text-foreground";
  zoomBadge.textContent = "100%";

  const btnZoomOut = document.createElement("button");
  btnZoomOut.type = "button";
  btnZoomOut.className =
    "rounded-full p-2 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors";
  btnZoomOut.title = "缩小 (-)";
  btnZoomOut.innerHTML = `
    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  `;

  const btnZoomIn = document.createElement("button");
  btnZoomIn.type = "button";
  btnZoomIn.className =
    "rounded-full p-2 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors";
  btnZoomIn.title = "放大 (+)";
  btnZoomIn.innerHTML = `
    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  `;

  const btnReset = document.createElement("button");
  btnReset.type = "button";
  btnReset.className =
    "rounded-full p-2 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors";
  btnReset.title = "还原 (1:1)";
  btnReset.innerHTML = `
    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
    </svg>
  `;

  const divider = document.createElement("span");
  divider.className = "w-px h-4 bg-border/60 mx-1";

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.className =
    "rounded-full p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors";
  btnClose.title = "关闭 (Esc)";
  btnClose.innerHTML = `
    <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  `;

  const sourceCode =
    wrapper.querySelector(".diagram-source-panel code")?.textContent ||
    wrapper.querySelector<HTMLElement>(".mermaid")?.dataset.source ||
    "";
  const rawLang =
    wrapper.getAttribute("data-diagram-lang") ||
    (wrapper.classList.contains("mermaid-wrapper") ? "mermaid" : "graphviz");
  const lang = rawLang.toUpperCase();

  let modalSourcePanel: HTMLElement | null = null;
  if (sourceCode) {
    const btnSource = document.createElement("button");
    btnSource.type = "button";
    btnSource.className =
      "rounded-full p-2 text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer";
    btnSource.title = "查看源码";
    btnSource.setAttribute("aria-label", "查看源码");
    btnSource.innerHTML = `
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    `;

    modalSourcePanel = document.createElement("div");
    modalSourcePanel.className =
      "diagram-modal-source-panel hidden absolute top-16 right-4 sm:right-6 w-[92vw] max-w-lg z-20 rounded-2xl border border-border/80 bg-surface/95 dark:bg-surface/90 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-200 select-text";
    modalSourcePanel.innerHTML = `
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-surface/80 dark:bg-surface/50 text-xs select-none">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded font-mono text-[11px] font-semibold tracking-wider text-accent bg-accent/15 uppercase">
            ${lang}
          </span>
          <span class="text-muted-foreground font-medium">图表源码 (支持逐字选择复制)</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="diagram-btn-modal-copy inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-accent hover:bg-muted/70 transition-colors cursor-pointer" title="复制代码" aria-label="复制代码">
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>复制代码</span>
          </button>
          <button type="button" class="diagram-btn-modal-close-source p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer" title="关闭" aria-label="关闭">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <pre class="p-4 m-0 overflow-x-auto text-xs font-mono text-foreground leading-relaxed max-h-[60vh] overflow-y-auto selection:bg-accent/30 select-text cursor-text"><code class="diagram-modal-source-code select-text cursor-text"></code></pre>
    `;
    modalSourcePanel.querySelector<HTMLElement>(
      ".diagram-modal-source-code"
    )!.textContent = sourceCode;

    const btnModalCopy = modalSourcePanel.querySelector<HTMLButtonElement>(
      ".diagram-btn-modal-copy"
    );
    const btnModalClose = modalSourcePanel.querySelector<HTMLButtonElement>(
      ".diagram-btn-modal-close-source"
    );

    btnSource.addEventListener("click", e => {
      e.stopPropagation();
      const isHidden = modalSourcePanel!.classList.contains("hidden");
      if (isHidden) {
        modalSourcePanel!.classList.remove("hidden");
        btnSource.classList.add("text-accent", "bg-muted/80");
      } else {
        modalSourcePanel!.classList.add("hidden");
        btnSource.classList.remove("text-accent", "bg-muted/80");
      }
    });

    btnModalClose?.addEventListener("click", e => {
      e.stopPropagation();
      modalSourcePanel!.classList.add("hidden");
      btnSource.classList.remove("text-accent", "bg-muted/80");
    });

    btnModalCopy?.addEventListener("click", async e => {
      e.stopPropagation();
      await navigator.clipboard.writeText(sourceCode);
      const originalHtml = btnModalCopy.innerHTML;
      btnModalCopy.innerHTML = `
        <svg class="size-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
        <span class="text-accent">已复制</span>
      `;
      btnModalCopy.classList.add("text-accent");
      setTimeout(() => {
        btnModalCopy.innerHTML = originalHtml;
        btnModalCopy.classList.remove("text-accent");
      }, 2000);
    });

    controls.append(
      zoomBadge,
      btnZoomOut,
      btnZoomIn,
      btnReset,
      divider,
      btnSource,
      btnClose
    );
  } else {
    controls.append(
      zoomBadge,
      btnZoomOut,
      btnZoomIn,
      btnReset,
      divider,
      btnClose
    );
  }
  header.append(titleGroup, controls);

  // Viewport & canvas
  const viewport = document.createElement("div");
  viewport.className =
    "diagram-modal-viewport flex-1 w-full h-full overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing p-6";

  const canvas = document.createElement("div");
  canvas.className =
    "diagram-modal-canvas flex items-center justify-center transition-transform duration-75 origin-center";
  canvas.appendChild(clonedSvg);
  viewport.appendChild(canvas);

  modal.append(header, viewport);
  if (modalSourcePanel) modal.append(modalSourcePanel);
  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  activeModal = modal;

  // Animation in
  requestAnimationFrame(() => modal.classList.add("opacity-100"));

  const state: DiagramState = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    startTranslateX: 0,
    startTranslateY: 0,
  };

  function updateTransform() {
    canvas.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
    zoomBadge.textContent = `${Math.round(state.scale * 100)}%`;
  }

  function closeModal() {
    modal.classList.remove("opacity-100");
    document.removeEventListener("keydown", onKeyDown);
    document.body.style.overflow = "";
    setTimeout(() => {
      modal.remove();
      if (activeModal === modal) activeModal = null;
    }, 200);
  }

  closeModalHandler = closeModal;

  btnClose.addEventListener("click", closeModal);

  btnZoomIn.addEventListener("click", () => {
    state.scale = Math.min(state.scale * 1.25, 8);
    updateTransform();
  });

  btnZoomOut.addEventListener("click", () => {
    state.scale = Math.max(state.scale / 1.25, 0.2);
    updateTransform();
  });

  btnReset.addEventListener("click", () => {
    state.scale = 1;
    state.translateX = 0;
    state.translateY = 0;
    updateTransform();
  });

  // Wheel zoom
  viewport.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.85;
      state.scale = Math.min(Math.max(state.scale * factor, 0.2), 10);
      updateTransform();
    },
    { passive: false }
  );

  // Mouse Drag / Pan
  viewport.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return;
    state.isDragging = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.startTranslateX = state.translateX;
    state.startTranslateY = state.translateY;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!state.isDragging) return;
      state.translateX =
        state.startTranslateX + (moveEvent.clientX - state.startX);
      state.translateY =
        state.startTranslateY + (moveEvent.clientY - state.startY);
      updateTransform();
    };

    const onMouseUp = () => {
      state.isDragging = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  // Touch Support
  let initialPinchDist = 0;
  let initialPinchScale = 1;

  viewport.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        initialPinchDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        initialPinchScale = state.scale;
      } else if (e.touches.length === 1) {
        state.isDragging = true;
        state.startX = e.touches[0].clientX;
        state.startY = e.touches[0].clientY;
        state.startTranslateX = state.translateX;
        state.startTranslateY = state.translateY;
      }
    },
    { passive: false }
  );

  viewport.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDist > 0) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        state.scale = Math.min(
          Math.max(initialPinchScale * (dist / initialPinchDist), 0.2),
          10
        );
        updateTransform();
      } else if (e.touches.length === 1 && state.isDragging) {
        e.preventDefault();
        state.translateX =
          state.startTranslateX + (e.touches[0].clientX - state.startX);
        state.translateY =
          state.startTranslateY + (e.touches[0].clientY - state.startY);
        updateTransform();
      }
    },
    { passive: false }
  );

  viewport.addEventListener("touchend", () => {
    state.isDragging = false;
    initialPinchDist = 0;
  });

  // Double click to toggle 1.5x zoom or reset
  viewport.addEventListener("dblclick", () => {
    if (state.scale > 1.05) {
      state.scale = 1;
      state.translateX = 0;
      state.translateY = 0;
    } else {
      state.scale = 1.75;
    }
    updateTransform();
  });

  // Keyboard navigation
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (modalSourcePanel && !modalSourcePanel.classList.contains("hidden")) {
        modalSourcePanel.classList.add("hidden");
        const btnSource = controls.querySelector(".diagram-btn-source");
        btnSource?.classList.remove("text-accent", "bg-muted/80");
        return;
      }
      closeModal();
    } else if (e.key === "+" || e.key === "=") {
      state.scale = Math.min(state.scale * 1.25, 10);
      updateTransform();
    } else if (e.key === "-") {
      state.scale = Math.max(state.scale / 1.25, 0.2);
      updateTransform();
    } else if (e.key === "0") {
      state.scale = 1;
      state.translateX = 0;
      state.translateY = 0;
      updateTransform();
    }
  }

  document.addEventListener("keydown", onKeyDown);
}

/**
 * Scan and setup all diagram containers on the page.
 */
export function setupDiagramPanZoom() {
  const wrappers = document.querySelectorAll<HTMLElement>(
    "[data-diagram-wrapper], .mermaid-wrapper, .graphviz-wrapper"
  );
  wrappers.forEach(initDiagramWrapper);
  fixAllDiagramsContrast();
}

// Lifecycle listeners
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupDiagramPanZoom);
} else {
  setupDiagramPanZoom();
}
document.addEventListener("astro:page-load", setupDiagramPanZoom);

// Re-adjust diagram contrast on theme changes
if (typeof document !== "undefined" && document.documentElement) {
  const themeObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "data-theme") {
        fixAllDiagramsContrast();
        if (activeModal) {
          fixDiagramContrast(activeModal);
        }
        break;
      }
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

document.addEventListener("astro:before-swap", () => {
  if (closeModalHandler) {
    closeModalHandler();
    closeModalHandler = null;
  }
});
