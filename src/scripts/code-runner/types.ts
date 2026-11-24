/**
 * Types for the Interactive Code Runner system.
 */

export type SupportedLanguage = "python" | "c" | "cpp";

export type RunnerStatus =
  "idle" | "loading_engine" | "running" | "success" | "error";

export interface AsmLineItem {
  text: string;
  sourceLine?: number | null;
  sourceColumn?: number | null;
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  engineName: string;
  exitCode?: number;
  error?: string;
  asm?: string;
  asmLines?: AsmLineItem[];
}

export interface EngineRunOptions {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onStatusChange?: (status: RunnerStatus, message: string) => void;
  compilerId?: string;
  userArguments?: string;
}
