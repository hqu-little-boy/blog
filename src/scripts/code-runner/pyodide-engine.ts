import type { ExecutionResult, EngineRunOptions } from "./types";

interface PyodideInterface {
  loadPackagesFromImports: (code: string) => Promise<void>;
  runPythonAsync: (code: string) => Promise<any>;
  runPython: (code: string) => any;
  setStdout: (options: { batched: (msg: string) => void }) => void;
  setStderr: (options: { batched: (msg: string) => void }) => void;
  globals: any;
}

let pyodideInstance: PyodideInterface | null = null;
let pyodideLoadingPromise: Promise<PyodideInterface> | null = null;

const PYODIDE_VERSION = "0.27.2";
const baseRoot = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
const PYODIDE_LOCAL_URL = `${baseRoot}/vendor/pyodide/`;
const PYODIDE_CDN_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/**
 * Dynamically inject a script tag and wait for it to load.
 */
function loadScriptTag(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error(`Failed to load ${src}`))
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Lazily load and initialize the Pyodide WebAssembly runtime.
 * Prioritizes self-hosted local assets with CacheStorage, falling back to CDN.
 */
export async function getPyodide(
  options?: EngineRunOptions
): Promise<PyodideInterface> {
  if (pyodideInstance) {
    return pyodideInstance;
  }

  if (pyodideLoadingPromise) {
    return pyodideLoadingPromise;
  }

  pyodideLoadingPromise = (async () => {
    options?.onStatusChange?.(
      "loading_engine",
      `正在加载 Pyodide v${PYODIDE_VERSION} (WebAssembly CPython)...`
    );

    let activeBaseUrl = PYODIDE_LOCAL_URL;

    // Check if script tag is already present or load local first, fallback to CDN
    if (!(window as any).loadPyodide) {
      try {
        await loadScriptTag(`${PYODIDE_LOCAL_URL}pyodide.js`);
      } catch {
        options?.onStatusChange?.(
          "loading_engine",
          "本地 Pyodide 脚本未命中，正在连接 CDN..."
        );
        activeBaseUrl = PYODIDE_CDN_URL;
        await loadScriptTag(`${PYODIDE_CDN_URL}pyodide.js`);
      }
    }

    options?.onStatusChange?.(
      "loading_engine",
      "正在初始化 WebAssembly 虚拟机与 Python 标准库环境..."
    );

    const loadPyodideFn = (window as any).loadPyodide;
    let pyodide: PyodideInterface;

    try {
      pyodide = await loadPyodideFn({
        indexURL: activeBaseUrl,
      });
    } catch {
      if (activeBaseUrl !== PYODIDE_CDN_URL) {
        options?.onStatusChange?.(
          "loading_engine",
          "本地运行时初始化异常，正在降级连接 CDN..."
        );
        pyodide = await loadPyodideFn({
          indexURL: PYODIDE_CDN_URL,
        });
      } else {
        throw new Error("Pyodide 运行时加载失败，请检查网络或刷新重试。");
      }
    }

    pyodideInstance = pyodide;
    return pyodide;
  })();

  try {
    return await pyodideLoadingPromise;
  } catch (err) {
    pyodideLoadingPromise = null;
    throw err;
  }
}

/**
 * Execute Python code in the browser via Pyodide.
 */
export async function runPythonCode(
  code: string,
  options: EngineRunOptions = {}
): Promise<ExecutionResult> {
  const startTime = performance.now();
  let stdoutAccumulator = "";
  let stderrAccumulator = "";

  const handleStdout = (chunk: string) => {
    stdoutAccumulator += chunk;
    options.onStdout?.(chunk);
  };

  const handleStderr = (chunk: string) => {
    stderrAccumulator += chunk;
    options.onStderr?.(chunk);
  };

  try {
    const pyodide = await getPyodide(options);

    options.onStatusChange?.("running", "正在执行 Python 代码...");

    // Bind stdout and stderr
    if (pyodide.setStdout) {
      pyodide.setStdout({
        batched: (msg: string) => handleStdout(msg + "\n"),
      });
    }
    if (pyodide.setStderr) {
      pyodide.setStderr({
        batched: (msg: string) => handleStderr(msg + "\n"),
      });
    }

    // Automatically load packages if code imports them (e.g. numpy, sympy, micropip)
    try {
      if (pyodide.loadPackagesFromImports) {
        options.onStatusChange?.("running", "分析代码依赖并准备执行...");
        await pyodide.loadPackagesFromImports(code);
      }
    } catch {
      // Non-critical: standard packages are already in base Pyodide
    }

    // Execute Python code asynchronously
    const evalResult = await pyodide.runPythonAsync(code);

    // If there is an evaluated result and stdout was empty, output representation
    if (
      evalResult !== undefined &&
      evalResult !== null &&
      stdoutAccumulator.trim() === ""
    ) {
      handleStdout(String(evalResult) + "\n");
    }

    const durationMs = Math.round(performance.now() - startTime);
    options.onStatusChange?.("success", `执行成功 (耗时 ${durationMs}ms)`);

    return {
      success: true,
      stdout: stdoutAccumulator,
      stderr: stderrAccumulator,
      durationMs,
      engineName: `Pyodide v${PYODIDE_VERSION} (WASM)`,
      exitCode: 0,
    };
  } catch (error: any) {
    const durationMs = Math.round(performance.now() - startTime);
    const errorMsg = error?.message || String(error);
    handleStderr(errorMsg + "\n");
    options.onStatusChange?.("error", `执行出错 (${durationMs}ms)`);

    return {
      success: false,
      stdout: stdoutAccumulator,
      stderr: stderrAccumulator,
      durationMs,
      engineName: `Pyodide v${PYODIDE_VERSION} (WASM)`,
      error: errorMsg,
      exitCode: 1,
    };
  }
}
