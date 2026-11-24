import type { ExecutionResult, EngineRunOptions, AsmLineItem } from "./types";

/**
 * Compiler Explorer (godbolt.org) RESTful API Engine.
 *
 * - Execution: Uses x86-64 GCC 14.2 (as Compiler Explorer's cloud execution sandbox only supports amd64).
 * - Assembly: Uses RISC-V 64-bit GCC 14.2 (rv64-gcc1420 / rv64-cgcc1420) to generate pure RISC-V 64 assembly.
 * Reference: https://github.com/compiler-explorer/compiler-explorer/blob/main/docs/API.md
 */

const CE_BASE_URL = "https://godbolt.org";

// Execution compilers (Compiler Explorer only provides runnable CPU sandboxes for amd64)
const EXEC_CPP_COMPILER_ID = "g142"; // x86-64 gcc 14.2
const EXEC_CPP_USER_ARGS = "-O2 -std=c++23 -pthread";

const EXEC_C_COMPILER_ID = "cg142"; // x86-64 gcc 14.2 (C)
const EXEC_C_USER_ARGS = "-O2 -std=c23 -lm";

// RISC-V 64 Assembly compilers
const ASM_CPP_COMPILER_ID = "rv64-gcc1420"; // RISC-V (64-bits) gcc 14.2.0
const ASM_CPP_USER_ARGS = "-O2 -std=c++23 -pthread";

const ASM_C_COMPILER_ID = "rv64-cgcc1420"; // RISC-V (64-bits) gcc 14.2.0 (C)
const ASM_C_USER_ARGS = "-O2 -std=c23 -lm";

interface CEOutputLine {
  text: string;
  source?: {
    file?: string | null;
    line?: number;
    column?: number;
  } | null;
  tag?: {
    line?: number;
    column?: number;
    text?: string;
    severity?: number;
    file?: string;
  };
}

interface CEBuildResult {
  code: number;
  timedOut?: boolean;
  stdout?: CEOutputLine[];
  stderr?: CEOutputLine[];
  execTime?: number;
  compilationOptions?: string[];
}

interface CECompileResponse {
  code: number;
  didExecute?: boolean;
  timedOut?: boolean;
  stdout?: CEOutputLine[];
  stderr?: CEOutputLine[];
  execTime?: number;
  buildResult?: CEBuildResult;
  execResult?: {
    code: number;
    didExecute?: boolean;
    timedOut?: boolean;
    stdout?: CEOutputLine[];
    stderr?: CEOutputLine[];
    buildResult?: CEBuildResult;
  };
  asm?: CEOutputLine[];
  message?: string;
}

/**
 * Strips ANSI color and control escape sequences.
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Extracts and formats output lines from Compiler Explorer response.
 */
function formatLines(lines?: CEOutputLine[]): string {
  if (!lines || !Array.isArray(lines)) return "";
  return lines.map(line => stripAnsi(line.text ?? "")).join("\n");
}

/**
 * Execute C or C++ code via Compiler Explorer RESTful API.
 * Uses x86-64 execution sandbox to run the code and return stdout/stderr results.
 */
export async function runCppCode(
  code: string,
  lang: "c" | "cpp" = "cpp",
  options: EngineRunOptions = {}
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const isC = lang === "c";
  const compilerId =
    options.compilerId || (isC ? EXEC_C_COMPILER_ID : EXEC_CPP_COMPILER_ID);
  const userArguments =
    options.userArguments || (isC ? EXEC_C_USER_ARGS : EXEC_CPP_USER_ARGS);
  const engineName = isC
    ? `Compiler Explorer (GCC 14.2 / C23)`
    : `Compiler Explorer (GCC 14.2 / C++23)`;

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

  options.onStatusChange?.(
    "loading_engine",
    `正在向 Compiler Explorer 提交代码运行 (${isC ? "C" : "C++"})...`
  );

  const payload = {
    source: code,
    compiler: compilerId,
    options: {
      userArguments,
      executeParameters: {
        args: [],
        stdin: "",
      },
      compilerOptions: {
        executorRequest: true,
      },
      filters: {
        execute: true,
      },
      tools: [],
      libraries: [],
    },
    lang: isC ? "c" : "c++",
    bypassCache: 0,
  };

  const controller = new AbortController();
  const timeoutMs = 25000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${CE_BASE_URL}/api/compiler/${compilerId}/compile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errDetail = "";
      try {
        const errorJson = await response.json();
        errDetail = errorJson.message || JSON.stringify(errorJson);
      } catch {
        errDetail = await response.text();
      }

      const errorMsg = `[Compiler Explorer API 错误] HTTP ${response.status}: ${errDetail || response.statusText}\n`;
      handleStderr(errorMsg);
      const durationMs = Math.round(performance.now() - startTime);
      options.onStatusChange?.("error", `API 请求失败 (${response.status})`);

      return {
        success: false,
        stdout: stdoutAccumulator,
        stderr: stderrAccumulator,
        durationMs,
        engineName,
        exitCode: response.status,
        error: errorMsg,
      };
    }

    const data: CECompileResponse = await response.json();
    const durationMs = Math.round(performance.now() - startTime);

    // 1. Check compilation/build outcome
    const buildResult = data.buildResult;
    const buildCode = buildResult
      ? buildResult.code
      : data.didExecute
        ? 0
        : data.code;

    if (buildCode !== 0) {
      const buildErr = formatLines(buildResult?.stderr || data.stderr);
      const buildOut = formatLines(buildResult?.stdout);

      if (buildErr) {
        handleStderr(buildErr + "\n");
      }
      if (buildOut) {
        handleStdout(buildOut + "\n");
      }

      if (
        buildErr.includes("undefined reference to `main'") ||
        buildErr.includes("undefined reference to 'main'")
      ) {
        handleStderr(
          "\n[提示] 代码片段缺少 main() 入口函数，无法直接作为独立程序运行。若需查看执行输出，请在代码中补充 main() 函数；或者点击“展示汇编”直接查看生成的 RISC-V 64 汇编指令。\n"
        );
      }

      options.onStatusChange?.("error", `编译构建失败 (exit: ${buildCode})`);

      return {
        success: false,
        stdout: stdoutAccumulator,
        stderr: stderrAccumulator,
        durationMs,
        engineName,
        exitCode: buildCode,
        error: buildErr || "Build failed",
      };
    }

    // 2. Compilation warnings
    if (buildResult?.stderr && buildResult.stderr.length > 0) {
      const warnings = formatLines(buildResult.stderr);
      if (warnings.trim()) {
        handleStderr(warnings + "\n");
      }
    }

    // 3. Process execution output
    if (data.didExecute) {
      const execStdout = formatLines(data.stdout);
      const execStderr = formatLines(data.stderr);

      if (execStdout) {
        handleStdout(execStdout + "\n");
      }
      if (execStderr) {
        handleStderr(execStderr + "\n");
      }

      if (data.timedOut) {
        handleStderr("\n[执行超时] 程序运行时间超出云端沙箱限制。\n");
      }

      if (data.code !== 0) {
        handleStderr(`\n[程序异常退出，退出码: ${data.code}]\n`);
        options.onStatusChange?.("error", `程序退出异常 (code: ${data.code})`);
        return {
          success: false,
          stdout: stdoutAccumulator,
          stderr: stderrAccumulator,
          durationMs,
          engineName,
          exitCode: data.code,
        };
      }

      if (!execStdout && !execStderr) {
        handleStdout("[程序执行成功，无控制台输出 (exit code: 0)]\n");
      }

      options.onStatusChange?.("success", `执行完成 (耗时 ${durationMs}ms)`);
      return {
        success: true,
        stdout: stdoutAccumulator,
        stderr: stderrAccumulator,
        durationMs,
        engineName,
        exitCode: 0,
      };
    }

    // Fallback if compilation finished
    const fallbackStdout = formatLines(data.stdout);
    const fallbackStderr = formatLines(data.stderr);
    if (fallbackStdout) handleStdout(fallbackStdout + "\n");
    if (fallbackStderr) handleStderr(fallbackStderr + "\n");

    options.onStatusChange?.("success", `编译完成 (${durationMs}ms)`);
    return {
      success: true,
      stdout: stdoutAccumulator,
      stderr: stderrAccumulator,
      durationMs,
      engineName,
      exitCode: data.code ?? 0,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const durationMs = Math.round(performance.now() - startTime);
    let errorMsg = "";

    if (err.name === "AbortError") {
      errorMsg = `[网络超时] 连接 Compiler Explorer API 超时 (${timeoutMs / 1000}s)，请检查网络连接。\n`;
    } else {
      errorMsg = `[网络异常] 请求 Compiler Explorer API 失败: ${err?.message || String(err)}\n`;
    }

    handleStderr(errorMsg);
    options.onStatusChange?.("error", "网络请求异常");

    return {
      success: false,
      stdout: stdoutAccumulator,
      stderr: stderrAccumulator,
      durationMs,
      engineName,
      error: errorMsg,
      exitCode: 1,
    };
  }
}

/**
 * Compile C or C++ code specifically to RISC-V 64 assembly via Compiler Explorer RESTful API.
 * Uses rv64-gcc1420 / rv64-cgcc1420 to generate pure RISC-V 64 assembly instructions.
 */
export async function compileCppToAssembly(
  code: string,
  lang: "c" | "cpp" = "cpp",
  options: EngineRunOptions = {}
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const isC = lang === "c";
  const compilerId =
    options.compilerId || (isC ? ASM_C_COMPILER_ID : ASM_CPP_COMPILER_ID);
  const userArguments =
    options.userArguments || (isC ? ASM_C_USER_ARGS : ASM_CPP_USER_ARGS);
  const engineName = isC
    ? `Compiler Explorer (RISC-V 64 GCC 14.2 / C23)`
    : `Compiler Explorer (RISC-V 64 GCC 14.2 / C++23)`;

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

  options.onStatusChange?.(
    "loading_engine",
    `正在向 Compiler Explorer 请求生成 RISC-V 64 汇编 (${isC ? "C" : "C++"})...`
  );

  const payload = {
    source: code,
    compiler: compilerId,
    options: {
      userArguments,
      filters: {
        binary: false,
        execute: false,
        demangle: true,
        directives: true,
        comments: true,
        labels: true,
        trim: true,
      },
      tools: [],
      libraries: [],
    },
    lang: isC ? "c" : "c++",
    bypassCache: 0,
  };

  const controller = new AbortController();
  const timeoutMs = 25000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${CE_BASE_URL}/api/compiler/${compilerId}/compile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errDetail = "";
      try {
        const errorJson = await response.json();
        errDetail = errorJson.message || JSON.stringify(errorJson);
      } catch {
        errDetail = await response.text();
      }

      const errorMsg = `[Compiler Explorer API 错误] HTTP ${response.status}: ${errDetail || response.statusText}\n`;
      handleStderr(errorMsg);
      const durationMs = Math.round(performance.now() - startTime);
      options.onStatusChange?.("error", `API 请求失败 (${response.status})`);

      return {
        success: false,
        stdout: stdoutAccumulator,
        stderr: stderrAccumulator,
        durationMs,
        engineName,
        exitCode: response.status,
        error: errorMsg,
      };
    }

    const data: CECompileResponse = await response.json();
    const durationMs = Math.round(performance.now() - startTime);

    if (data.code !== 0 && (!data.asm || data.asm.length === 0)) {
      const buildErr = formatLines(data.buildResult?.stderr || data.stderr);
      if (buildErr) {
        handleStderr(buildErr + "\n");
      }
      options.onStatusChange?.("error", `汇编编译失败 (exit: ${data.code})`);

      return {
        success: false,
        stdout: stdoutAccumulator,
        stderr: stderrAccumulator,
        durationMs,
        engineName,
        exitCode: data.code,
        error: buildErr || "Assembly compilation failed",
      };
    }

    // Warnings if any
    if (data.buildResult?.stderr && data.buildResult.stderr.length > 0) {
      const warnings = formatLines(data.buildResult.stderr);
      if (warnings.trim()) {
        handleStderr(warnings + "\n");
      }
    } else if (
      data.stderr &&
      data.stderr.length > 0 &&
      (!data.asm || data.asm.length === 0)
    ) {
      const warnings = formatLines(data.stderr);
      if (warnings.trim()) {
        handleStderr(warnings + "\n");
      }
    }

    const asmLines: AsmLineItem[] = Array.isArray(data.asm)
      ? data.asm.map(item => ({
          text: stripAnsi(item.text ?? ""),
          sourceLine: item.source?.line != null ? item.source.line : null,
          sourceColumn: item.source?.column != null ? item.source.column : null,
        }))
      : [];

    const asmText = asmLines.map(line => line.text).join("\n");
    if (asmText) {
      handleStdout(
        `; ==========================================\n; RISC-V 64 目标汇编 (GCC 14.2)\n; 架构指令集: riscv64 | 编译参数: ${userArguments}\n; ==========================================\n\n${asmText}\n`
      );
    } else {
      handleStdout("; [未生成汇编指令或代码为空]\n");
    }

    const lineCount = asmLines.length;
    options.onStatusChange?.(
      "success",
      `RISC-V 64 汇编生成完毕 (${lineCount} 行，耗时 ${durationMs}ms)`
    );

    return {
      success: true,
      stdout: stdoutAccumulator,
      stderr: stderrAccumulator,
      durationMs,
      engineName,
      exitCode: 0,
      asm: asmText,
      asmLines,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const durationMs = Math.round(performance.now() - startTime);
    let errorMsg = "";

    if (err.name === "AbortError") {
      errorMsg = `[网络超时] 连接 Compiler Explorer API 超时 (${timeoutMs / 1000}s)，请检查网络连接。\n`;
    } else {
      errorMsg = `[网络异常] 请求 Compiler Explorer API 失败: ${err?.message || String(err)}\n`;
    }

    handleStderr(errorMsg);
    options.onStatusChange?.("error", "网络请求异常");

    return {
      success: false,
      stdout: stdoutAccumulator,
      stderr: stderrAccumulator,
      durationMs,
      engineName,
      error: errorMsg,
      exitCode: 1,
    };
  }
}
