import type { ExecutionResult, EngineRunOptions } from "./types";

/**
 * Compiler Explorer (godbolt.org) RESTful API Execution & Assembly Engine.
 *
 * Configured for RISC-V 64-bit architecture (riscv64).
 * Supports standard C and C++ compilation, RISC-V 64 assembly extraction,
 * and execution via Compiler Explorer RESTful API.
 * Reference: https://github.com/compiler-explorer/compiler-explorer/blob/main/docs/API.md
 */

const CE_BASE_URL = "https://godbolt.org";

// Default compilers and compiler options (RISC-V 64-bit)
const CPP_COMPILER_ID = "rv64-gcc1420"; // RISC-V (64-bits) gcc 14.2.0
const CPP_USER_ARGS = "-O2 -std=c++23 -pthread";

const C_COMPILER_ID = "rv64-cgcc1420"; // RISC-V (64-bits) gcc 14.2.0 (C)
const C_USER_ARGS = "-O2 -std=c23 -lm";

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
 * Execute C or C++ code via Compiler Explorer RESTful API (RISC-V 64-bit).
 */
export async function runCppCode(
  code: string,
  lang: "c" | "cpp" = "cpp",
  options: EngineRunOptions = {}
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const isC = lang === "c";
  const compilerId =
    options.compilerId || (isC ? C_COMPILER_ID : CPP_COMPILER_ID);
  const userArguments =
    options.userArguments || (isC ? C_USER_ARGS : CPP_USER_ARGS);
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
    `正在向 Compiler Explorer 提交代码 (${isC ? "C" : "C++"} / RISC-V 64)...`
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
        executorRequest: false,
      },
      filters: {
        execute: true,
        demangle: true,
        directives: true,
        comments: true,
        labels: true,
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
    const buildResult = data.buildResult || data.execResult?.buildResult;
    const buildCode = buildResult ? buildResult.code : data.code;

    // Check if build failed
    if (buildCode !== 0 && (!data.asm || data.asm.length === 0)) {
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
          "\n[提示] 代码片段缺少 main() 入口函数，无法直接作为可执行程序运行。若需查看控制台输出，请在代码中编写 main() 函数，或点击“展示汇编”直接查看生成的 RISC-V 64 汇编。\n"
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
      if (
        warnings.trim() &&
        !warnings.includes("undefined reference to `main'")
      ) {
        handleStderr(warnings + "\n");
      }
    }

    // 3. Process execution output or fallback to assembly when execution not available
    const execStderr = formatLines(data.execResult?.stderr || data.stderr);
    const didExecute = Boolean(data.didExecute || data.execResult?.didExecute);
    const isNoExecAvailable =
      execStderr.includes("No execution available for riscv64") ||
      (!didExecute && buildCode === 0);

    if (isNoExecAvailable && data.asm && data.asm.length > 0) {
      const asmText = formatLines(data.asm);
      handleStdout(
        `[Compiler Explorer 提示] 云端环境暂未开放 RISC-V 64 裸机/CPU 仿真运行环境 (No execution available for riscv64)。\n已为您自动编译并提取 RISC-V 64 目标汇编代码 (${userArguments})：\n\n${asmText}\n`
      );
      options.onStatusChange?.(
        "success",
        `编译完成，展示 RISC-V 64 汇编 (耗时 ${durationMs}ms)`
      );
      return {
        success: true,
        stdout: stdoutAccumulator,
        stderr: stderrAccumulator,
        durationMs,
        engineName,
        exitCode: 0,
        asm: asmText,
      };
    }

    if (didExecute) {
      const execStdout = formatLines(data.execResult?.stdout || data.stdout);
      const finalStderr = formatLines(data.execResult?.stderr || data.stderr);

      if (execStdout) {
        handleStdout(execStdout + "\n");
      }
      if (finalStderr) {
        handleStderr(finalStderr + "\n");
      }

      if (data.timedOut || data.execResult?.timedOut) {
        handleStderr("\n[执行超时] 程序运行时间超出云端沙箱限制。\n");
      }

      const exitCode = data.execResult?.code ?? data.code;
      if (exitCode !== 0) {
        handleStderr(`\n[程序异常退出，退出码: ${exitCode}]\n`);
        options.onStatusChange?.("error", `程序退出异常 (code: ${exitCode})`);
        return {
          success: false,
          stdout: stdoutAccumulator,
          stderr: stderrAccumulator,
          durationMs,
          engineName,
          exitCode,
        };
      }

      if (!execStdout && !finalStderr) {
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

    if (data.asm && data.asm.length > 0) {
      const asmText = formatLines(data.asm);
      handleStdout(`\n[RISC-V 64 汇编代码]\n${asmText}\n`);
    }

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
 * Compile C or C++ code to RISC-V 64 assembly via Compiler Explorer RESTful API.
 */
export async function compileCppToAssembly(
  code: string,
  lang: "c" | "cpp" = "cpp",
  options: EngineRunOptions = {}
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const isC = lang === "c";
  const compilerId =
    options.compilerId || (isC ? C_COMPILER_ID : CPP_COMPILER_ID);
  const userArguments =
    options.userArguments || (isC ? C_USER_ARGS : CPP_USER_ARGS);
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

    const asmText = formatLines(data.asm);
    if (asmText) {
      handleStdout(
        `; ==========================================\n; RISC-V 64 目标汇编 (GCC 14.2)\n; 架构指令集: riscv64 | 编译参数: ${userArguments}\n; ==========================================\n\n${asmText}\n`
      );
    } else {
      handleStdout("; [未生成汇编指令或代码为空]\n");
    }

    const lineCount = data.asm?.length || 0;
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
