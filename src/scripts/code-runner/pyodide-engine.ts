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

const PYODIDE_CDN_VERSION = "0.27.2";
const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_CDN_VERSION}/full/`;

/**
 * Lazily load and initialize the Pyodide WebAssembly runtime.
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
      `正在按需加载 Pyodide v${PYODIDE_CDN_VERSION} (WebAssembly CPython)...`
    );

    // Check if script tag is already present or inject it
    if (!(window as any).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const existingScript = document.querySelector(
          `script[src*="pyodide.js"]`
        );
        if (existingScript) {
          existingScript.addEventListener("load", () => resolve());
          existingScript.addEventListener("error", () =>
            reject(new Error("Pyodide 资源脚本加载失败"))
          );
          return;
        }

        const script = document.createElement("script");
        script.src = `${PYODIDE_BASE_URL}pyodide.js`;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () =>
          reject(
            new Error(
              "Pyodide CDN 加载失败，请检查网络连接或 CDN 可用性。"
            )
          );
        document.head.appendChild(script);
      });
    }

    options?.onStatusChange?.(
      "loading_engine",
      "正在初始化 WebAssembly 虚拟机与 Python 标准库环境..."
    );

    const loadPyodideFn = (window as any).loadPyodide;
    const pyodide = await loadPyodideFn({
      indexURL: PYODIDE_BASE_URL,
    });

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
    options.onStatusChange?.(
      "success",
      `执行成功 (耗时 ${durationMs}ms)`
    );

    return {
      success: true,
      stdout: stdoutAccumulator,
      stderr: stderrAccumulator,
      durationMs,
      engineName: `Pyodide v${PYODIDE_CDN_VERSION} (WASM)`,
      exitCode: 0,
    };
  } catch (error: any) {
    const durationMs = Math.round(performance.now() - startTime);
    let errorMsg = error?.message || String(error);

    // Friendly explanation for framework proprietary snippets (e.g. torch, tvm, triton)
    if (
      code.includes("nn.Conv2d") ||
      code.includes("tir.Schedule") ||
      code.includes("BlockedLayout") ||
      errorMsg.includes("name 'nn' is not defined") ||
      errorMsg.includes("name 'tir' is not defined") ||
      errorMsg.includes("name 'gl' is not defined")
    ) {
      handleStderr(
        `[框架配置与架构片段提示]\n本段代码属于特定深度学习框架 (PyTorch/TVM/Triton) 的声明或配置伪代码，依赖宿主机专用深度学习环境。\n提示: 浏览器已内置纯本地 Python 3.12 虚拟机，可在上方点击「✏️ 编辑代码」编写标准库代码进行本地运算！\n`
      );
    } else {
      handleStderr(errorMsg + "\n");
    }

    options.onStatusChange?.("error", `执行出错 (${durationMs}ms)`);

    return {
      success: false,
      stdout: stdoutAccumulator,
      stderr: stderrAccumulator,
      durationMs,
      engineName: `Pyodide v${PYODIDE_CDN_VERSION} (WASM)`,
      error: errorMsg,
      exitCode: 1,
    };
  }
}
