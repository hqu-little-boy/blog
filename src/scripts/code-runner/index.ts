import { setupInteractiveCodeBlocks } from "./ui-controller";

/**
 * Initialize Interactive Code Runner on page load and View Transitions.
 */
function initCodeRunner() {
  setupInteractiveCodeBlocks();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCodeRunner);
} else {
  initCodeRunner();
}

document.addEventListener("astro:page-load", initCodeRunner);
