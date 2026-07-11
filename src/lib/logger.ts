/**
 * Structured JSON logging + pluggable error reporting.
 * In production, stdout JSON lines are shipped to CloudWatch; wire
 * `reportError` to Sentry/Bugsnag by setting the hook once at startup.
 */

type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...meta,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};

type ErrorReporter = (err: unknown, context?: Record<string, unknown>) => void;
let errorReporter: ErrorReporter | null = null;

export function setErrorReporter(fn: ErrorReporter) {
  errorReporter = fn;
}

export function reportError(err: unknown, context?: Record<string, unknown>) {
  logger.error(err instanceof Error ? err.message : String(err), {
    stack: err instanceof Error ? err.stack : undefined,
    ...context,
  });
  errorReporter?.(err, context);
}
