/**
 * Types for the Interactive Code Runner system.
 */

export type SupportedLanguage = "python" | "c" | "cpp";

export type RunnerStatus =
  | "idle"
  | "loading_engine"
  | "running"
  | "success"
  | "error";

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  engineName: string;
  exitCode?: number;
  error?: string;
}

export interface EngineRunOptions {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onStatusChange?: (status: RunnerStatus, message: string) => void;
}
