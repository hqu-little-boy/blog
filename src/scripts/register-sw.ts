/**
 * Register Service Worker and manage Pyodide runtime cache pre-warming.
 */

function triggerPrewarm(registration: ServiceWorkerRegistration) {
  const hasPython = document.querySelector(
    'pre[data-language="python"], pre[data-language="py"], .language-python, .language-py'
  );

  if (hasPython && registration.active) {
    registration.active.postMessage({ type: "PRECACHE_PYODIDE" });
  }
}

export function setupServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const base = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  const swUrl = `${base}/sw.js`;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(swUrl, { scope: `${base}/` })
      .then(registration => {
        const schedulePrewarm = () => {
          if ("requestIdleCallback" in window) {
            window.requestIdleCallback(() => triggerPrewarm(registration));
          } else {
            setTimeout(() => triggerPrewarm(registration), 1500);
          }
        };

        schedulePrewarm();

        // Listen for Astro View Transition page navigations
        document.addEventListener("astro:page-load", schedulePrewarm);
      })
      .catch(() => {
        // Service worker registration ignored if blocked or unsupported
      });
  });
}

setupServiceWorker();
