import type { ExecutionResult, EngineRunOptions } from "./types";

/**
 * Compiler Explorer (godbolt.org) RESTful API Execution Engine.
 *
 * Supports standard C and C++ compilation and execution via Compiler Explorer API.
 * Reference: https://github.com/compiler-explorer/compiler-explorer/blob/main/docs/API.md
 */

const CE_BASE_URL = "https://godbolt.org";

// Default compilers and compiler options
const CPP_COMPILER_ID = "g142"; // x86-64 gcc 14.2
const CPP_USER_ARGS = "-O2 -std=c++23 -pthread";

const C_COMPILER_ID = "cg142"; // x86-64 gcc 14.2 (C)
const C_USER_ARGS = "-O2 -std=c23 -lm";

interface CEOutputLine {
  text: string;
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
    `正在向 Compiler Explorer 提交编译并执行 (${isC ? "C" : "C++"})...`
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
          "\n[提示] 代码片段缺少 main() 入口函数，无法直接作为可执行程序运行。若需查看控制台输出，请在代码中编写 main() 函数。\n"
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

    // 2. Compilation succeeded, check for any build warnings
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

    // Fallback if compilation finished but was not marked as executed
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
