import type { ExecutionResult, EngineRunOptions } from "./types";

const WANDBOX_API_URL = "https://wandbox.org/api/compile.json";

/**
 * Interface to run C/C++ code.
 * Seamlessly integrates Emscripten WASM module execution and modern C++20 online sandbox runner.
 */
export async function runCppCode(
  code: string,
  lang: "c" | "cpp" = "cpp",
  options: EngineRunOptions = {}
): Promise<ExecutionResult> {
  const startTime = performance.now();

  options.onStatusChange?.(
    "loading_engine",
    lang === "cpp"
      ? "正在准备 C++20 现代编译器运行环境..."
      : "正在准备 C17 编译器运行环境..."
  );

  // Check if this is a Bank Conflict simulation or specific Emscripten demo code
  const isBankConflictDemo =
    code.includes("simulate_bank_conflict") || code.includes("bank_hits");

  if (isBankConflictDemo && (window as any).__runBankConflictWasm) {
    try {
      options.onStatusChange?.("running", "调用本地 Emscripten WebAssembly 模块执行...");
      const wasmRes = await (window as any).__runBankConflictWasm(code);
      const durationMs = Math.round(performance.now() - startTime);
      options.onStdout?.(wasmRes);
      options.onStatusChange?.("success", `Emscripten WASM 执行完成 (${durationMs}ms)`);
      return {
        success: true,
        stdout: wasmRes,
        stderr: "",
        durationMs,
        engineName: "Emscripten Native WASM",
        exitCode: 0,
      };
    } catch (e: any) {
      // Fallback to online compilation if local wasm has any issue
    }
  }

  // Use Wandbox high-speed compiler pipeline
  try {
    options.onStatusChange?.(
      "running",
      lang === "cpp" ? "GCC 14 / Clang 现代编译器编译运行中..." : "GCC C 编译器编译运行中..."
    );

    const compiler = lang === "cpp" ? "gcc-head" : "gcc-head-c";
    const compilerOptions = lang === "cpp" ? "c++20,warning,optimize" : "c17,warning,optimize";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const response = await fetch(WANDBOX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        compiler,
        options: compilerOptions,
        code,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`编译器服务端响应异常: HTTP ${response.status}`);
    }

    const data = await response.json();
    const durationMs = Math.round(performance.now() - startTime);

    const programOutput = data.program_output || "";
    const programError = data.program_error || "";
    const compilerError = data.compiler_error || "";
    const compilerMessage = data.compiler_message || "";
    const exitStatus = parseInt(data.status ?? "0", 10);

    let fullStdout = programOutput;
    let fullStderr = "";

    if (compilerError || (exitStatus !== 0 && !programOutput)) {
      fullStderr = compilerError || compilerMessage || programError;
    } else if (programError) {
      fullStderr = programError;
    }

    if (fullStdout) {
      options.onStdout?.(fullStdout);
    }
    if (fullStderr) {
      options.onStderr?.(fullStderr);
    }

    if (exitStatus === 0) {
      options.onStatusChange?.(
        "success",
        `编译运行成功 (耗时 ${durationMs}ms)`
      );
      return {
        success: true,
        stdout: fullStdout,
        stderr: fullStderr,
        durationMs,
        engineName: lang === "cpp" ? "Emscripten / GCC C++20 Sandbox" : "Emscripten / GCC C17 Sandbox",
        exitCode: 0,
      };
    } else {
      options.onStatusChange?.(
        "error",
        `编译或运行时退出状态码: ${exitStatus} (${durationMs}ms)`
      );
      return {
        success: false,
        stdout: fullStdout,
        stderr: fullStderr,
        durationMs,
        engineName: lang === "cpp" ? "Emscripten / GCC C++20 Sandbox" : "Emscripten / GCC C17 Sandbox",
        error: fullStderr || "执行异常退出",
        exitCode: exitStatus,
      };
    }
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    const errorMsg =
      err.name === "AbortError"
        ? "代码执行超时 (超过 12 秒)"
        : `网络执行异常: ${err.message || String(err)}`;

    options.onStderr?.(errorMsg + "\n");
    options.onStatusChange?.("error", `执行失败 (${durationMs}ms)`);

    return {
      success: false,
      stdout: "",
      stderr: errorMsg,
      durationMs,
      engineName: "Emscripten / C++ Sandbox",
      error: errorMsg,
      exitCode: 1,
    };
  }
}
