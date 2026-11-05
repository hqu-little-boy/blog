/**
 * Universal contrast optimization utility for diagrams (Mermaid & Graphviz).
 * Ensures that text inside any node, cluster, note, or box always maintains
 * high contrast (WCAG AA/AAA compliant) against the background fill directly underneath it.
 */

export function parseColorToRgb(
  colorStr: string
): { r: number; g: number; b: number; a: number } | null {
  if (!colorStr || colorStr === "none" || colorStr === "transparent") return null;

  colorStr = colorStr.trim().toLowerCase();

  // Hex format: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (colorStr.startsWith("#")) {
    const hex = colorStr.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  // rgb(...) or rgba(...)
  const rgbMatch = colorStr.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/
  );
  if (rgbMatch) {
    return {
      r: parseFloat(rgbMatch[1]),
      g: parseFloat(rgbMatch[2]),
      b: parseFloat(rgbMatch[3]),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  // Common named colors frequently used in DOT / Mermaid
  const namedColors: Record<string, [number, number, number]> = {
    white: [255, 255, 255],
    black: [0, 0, 0],
    red: [239, 68, 68],
    green: [34, 197, 94],
    blue: [59, 130, 246],
    yellow: [234, 179, 8],
    cyan: [6, 182, 212],
    orange: [249, 115, 22],
    pink: [236, 72, 153],
    purple: [168, 85, 247],
    gray: [107, 114, 128],
    grey: [107, 114, 128],
    lightgray: [211, 211, 211],
    lightgrey: [211, 211, 211],
    darkgray: [75, 85, 99],
    darkgrey: [75, 85, 99],
  };
  if (namedColors[colorStr]) {
    const [r, g, b] = namedColors[colorStr];
    return { r, g, b, a: 1 };
  }

  return null;
}

/**
 * Calculates WCAG 2.1 relative luminance for sRGB values (0.0 = black, 1.0 = pure white).
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    const val = v / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Extracts the effective fill color of an SVG background element.
 */
function extractFillColor(shape: SVGElement): string | null {
  // 1. Direct inline style
  if (shape.style && shape.style.fill) {
    const fill = shape.style.fill.trim();
    if (fill && fill !== "none" && fill !== "transparent") return fill;
  }

  // 2. SVG fill attribute
  const attrFill = shape.getAttribute("fill");
  if (attrFill && attrFill !== "none" && attrFill !== "transparent") {
    return attrFill.trim();
  }

  // 3. Computed style in browser
  if (typeof window !== "undefined") {
    try {
      const computed = window.getComputedStyle(shape);
      const compFill = computed.fill;
      if (compFill && compFill !== "none" && compFill !== "transparent") {
        return compFill.trim();
      }
      const compBg = computed.backgroundColor;
      if (compBg && compBg !== "transparent" && compBg !== "rgba(0, 0, 0, 0)") {
        return compBg.trim();
      }
    } catch {
      // Ignored if detached or invisible
    }
  }

  return null;
}

/**
 * Applies high-contrast styling to all text elements within a node container.
 */
function applyTextContrast(
  container: Element,
  fillColorStr: string
) {
  const rgb = parseColorToRgb(fillColorStr);
  if (!rgb) return;

  // Ignore fully transparent background layers
  if (rgb.a < 0.15) return;

  const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);

  // If luminance > 0.42, background is light. Text must be crisp dark.
  // If luminance <= 0.42, background is dark. Text must be clean light.
  const isLightBackground = lum > 0.42;

  const darkTextColor = "#181d1c"; // Deep charcoal with maximum legibility
  const lightTextColor = "#f7faf9"; // Clean off-white
  const targetColor = isLightBackground ? darkTextColor : lightTextColor;

  // 1. Style SVG text and tspan elements
  const svgTexts = container.querySelectorAll<SVGTextElement | SVGTSpanElement>(
    "text, tspan"
  );
  svgTexts.forEach(txt => {
    txt.style.setProperty("fill", targetColor, "important");
    if (isLightBackground) {
      txt.style.setProperty("font-weight", "500", "important");
    }
  });

  // 2. Style Mermaid HTML foreignObject labels (.nodeLabel, span, div, p)
  const htmlLabels = container.querySelectorAll<HTMLElement>(
    ".nodeLabel, span, div, p, a, strong, em"
  );
  htmlLabels.forEach(el => {
    el.style.setProperty("color", targetColor, "important");
    el.style.setProperty("fill", targetColor, "important");
    if (isLightBackground) {
      el.style.setProperty("font-weight", "500", "important");
    }
  });
}

/**
 * Traverses a rendered SVG container and dynamically fixes contrast issues
 * for both Mermaid and Graphviz diagram elements.
 */
export function fixDiagramContrast(root: HTMLElement | SVGElement) {
  if (!root) return;

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "dark";

  // ===== 1. Mermaid flowchart, state, and class diagram nodes =====
  const mermaidNodes = root.querySelectorAll<SVGElement>("g.node");
  mermaidNodes.forEach(node => {
    // Look for background shape (rect, polygon, path, circle, ellipse)
    const shape = node.querySelector<SVGElement>(
      ":scope > rect, :scope > polygon, :scope > path, :scope > circle, :scope > ellipse, :scope > .label-container, rect.basic, rect.label-container"
    ) || node.querySelector<SVGElement>("rect, polygon, path, circle, ellipse");

    if (shape) {
      const fill = extractFillColor(shape);
      if (fill) {
        applyTextContrast(node, fill);
      }
    }
  });

  // ===== 2. Mermaid sequence diagram notes and rect highlights =====
  const mermaidNotes = root.querySelectorAll<SVGElement>("g.note, .note");
  mermaidNotes.forEach(note => {
    const shape = note.querySelector<SVGElement>("rect") || (note.tagName.toLowerCase() === "rect" ? note : null);
    if (shape) {
      const fill = extractFillColor(shape) || (isDark ? "#24272b" : "#fef3c7");
      applyTextContrast(note, fill);
    }
  });

  // Sequence diagram highlight rects
  const mermaidHighlightRects = root.querySelectorAll<SVGRectElement>("rect.rect");
  mermaidHighlightRects.forEach(rect => {
    const fill = extractFillColor(rect);
    if (fill && rect.parentElement) {
      applyTextContrast(rect.parentElement, fill);
    }
  });

  // ===== 3. Mermaid subgraphs / clusters =====
  const mermaidClusters = root.querySelectorAll<SVGElement>("g.cluster");
  mermaidClusters.forEach(cluster => {
    const shape = cluster.querySelector<SVGElement>(
      ":scope > rect, rect.outer, rect.inner, rect"
    );
    if (shape) {
      const fill = extractFillColor(shape);
      if (fill) {
        // Find cluster header / label specifically
        const label = cluster.querySelector<SVGElement>(".cluster-label, span.nodeLabel, text");
        if (label) {
          applyTextContrast(label.parentElement || label, fill);
        }
      }
    }
  });

  // ===== 4. Graphviz nodes =====
  const graphvizNodes = root.querySelectorAll<SVGElement>("g.node");
  graphvizNodes.forEach(node => {
    const shape = node.querySelector<SVGElement>(
      ":scope > polygon, :scope > path, :scope > ellipse, :scope > circle"
    ) || node.querySelector<SVGElement>("polygon, path, ellipse, circle");

    if (shape) {
      const fill = extractFillColor(shape);
      if (fill) {
        applyTextContrast(node, fill);
      }
    }
  });

  // ===== 5. Graphviz clusters / subgraphs =====
  const graphvizClusters = root.querySelectorAll<SVGElement>("g.cluster");
  graphvizClusters.forEach(cluster => {
    const shape = cluster.querySelector<SVGElement>(
      ":scope > polygon, :scope > path, polygon, path"
    );
    if (shape) {
      const fill = extractFillColor(shape);
      if (fill) {
        // Direct texts of cluster (excluding texts belonging to descendant nodes)
        const allTexts = cluster.querySelectorAll<SVGTextElement>("text");
        allTexts.forEach(txt => {
          if (!txt.closest(".node")) {
            applyTextContrast(txt, fill);
          }
        });
      }
    }
  });
}

/**
 * Scans all diagram wrappers on the page and runs contrast adjustment.
 */
export function fixAllDiagramsContrast() {
  if (typeof document === "undefined") return;
  const wrappers = document.querySelectorAll<HTMLElement>(
    "[data-diagram-wrapper], .mermaid-wrapper, .graphviz-wrapper"
  );
  wrappers.forEach(fixDiagramContrast);
}
