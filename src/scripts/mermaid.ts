import { setupDiagramPanZoom } from "./diagram-pan-zoom";

/**
 * Client-side dynamic loader and renderer for Mermaid diagrams.
 * Only loads mermaid bundle when diagrams are present on the current page.
 * Supports theme toggling and Astro View Transitions.
 */

async function renderMermaid() {
  const elements = document.querySelectorAll<HTMLElement>(".mermaid");
  if (!elements || elements.length === 0) return;

  try {
    const { default: mermaid } = await import("mermaid");
    const isDark = document.firstElementChild?.getAttribute("data-theme") === "dark";

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      fontFamily: "var(--font-app-sans)",
      theme: isDark ? "dark" : "base",
      themeVariables: isDark
        ? {
            darkMode: true,
            background: "transparent",
            mainBkg: "#24272b",
            primaryColor: "#24272b",
            primaryTextColor: "#e3e2e6",
            primaryBorderColor: "#55d6ec",
            lineColor: "#55d6ec",
            secondaryColor: "#1c1e21",
            secondaryTextColor: "#e3e2e6",
            secondaryBorderColor: "#33363b",
            tertiaryColor: "#131314",
            nodeBorder: "#55d6ec",
            clusterBkg: "#1c1e21",
            clusterBorder: "#33363b",
            edgeLabelBackground: "#1c1e21",
            actorBkg: "#24272b",
            actorBorder: "#55d6ec",
            actorTextColor: "#e3e2e6",
            signalColor: "#55d6ec",
            signalTextColor: "#e3e2e6",
          }
        : {
            darkMode: false,
            background: "transparent",
            mainBkg: "#f1ede6",
            primaryColor: "#f1ede6",
            primaryTextColor: "#1c1b1f",
            primaryBorderColor: "#006878",
            lineColor: "#006878",
            secondaryColor: "#ffffff",
            secondaryTextColor: "#1c1b1f",
            secondaryBorderColor: "#e2dcd3",
            tertiaryColor: "#faf8f5",
            nodeBorder: "#006878",
            clusterBkg: "#faf8f5",
            clusterBorder: "#e2dcd3",
            edgeLabelBackground: "#faf8f5",
            actorBkg: "#f1ede6",
            actorBorder: "#006878",
            actorTextColor: "#1c1b1f",
            signalColor: "#006878",
            signalTextColor: "#1c1b1f",
          },
    });

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const source = el.dataset.source || el.textContent || "";
      if (!source.trim()) continue;

      el.removeAttribute("data-processed");
      el.textContent = source;

      try {
        const uniqueId = `mermaid-chart-${Date.now()}-${i}`;
        const { svg } = await mermaid.render(uniqueId, source);
        el.innerHTML = svg;
      } catch (renderError) {
        console.error("[Mermaid] Render error:", renderError);
      }
    }

    // Attach pan & zoom interactions to newly rendered Mermaid SVGs
    setupDiagramPanZoom();
  } catch (loadError) {
    console.error("[Mermaid] Failed to load library:", loadError);
  }
}

// Attach to ViewTransitions and initial page load
document.addEventListener("astro:page-load", renderMermaid);

// Re-render when theme changes (light <-> dark)
const themeObserver = new MutationObserver(mutations => {
  for (const m of mutations) {
    if (m.type === "attributes" && m.attributeName === "data-theme") {
      renderMermaid();
      break;
    }
  }
});

const htmlElement = document.documentElement;
if (htmlElement) {
  themeObserver.observe(htmlElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}
