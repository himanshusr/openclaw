import { danger, info, logVerboseConsole, success, warn } from "./globals.js";
import { getLogger } from "./logging/logger.js";
import { createSubsystemLogger } from "./logging/subsystem.js";
import { defaultRuntime, type RuntimeEnv } from "./runtime.js";

// 630:P3 Issue #62 -- Decorator pattern.
//
// The four level wrappers (logInfo/logWarn/logSuccess/logError) used to be
// near-verbatim copies of the same nine-line body. Each one ran the same
// three-stage pipeline:
//
//   subsystem-prefix routing -> console styling -> structured forwarding
//
// Decorator captures that pipeline once: each stage is a function that
// wraps a base sink and returns a new sink. The four exported helpers are
// now thin level-bound applications of the same composed pipeline. Adding
// a stage (e.g. redaction, structured-fields) means inserting one decorator
// in `composeSink`, not editing every level. See logger.test.ts for
// behavior contracts that are preserved by this refactor.

type LogLevel = "info" | "warn" | "success" | "error";

type Sink = (message: string, runtime: RuntimeEnv) => void;

const subsystemPrefixRe = /^([a-z][a-z0-9-]{1,20}):\s+(.*)$/i;

function splitSubsystem(message: string) {
  const match = message.match(subsystemPrefixRe);
  if (!match) {
    return null;
  }
  const [, subsystem, rest] = match;
  return { subsystem, rest };
}

// Decorator stage 1: peel a known "subsystem:" prefix off the message and
// route it to the structured subsystem logger; bypass downstream stages.
function withSubsystemRouting(next: Sink): Sink {
  return (message, runtime) => {
    const parsed = runtime === defaultRuntime ? splitSubsystem(message) : null;
    if (parsed) {
      const subsystemLogger = createSubsystemLogger(parsed.subsystem);
      const method = subsystemMethodForLevel(currentLevel());
      subsystemLogger[method](parsed.rest);
      return;
    }
    next(message, runtime);
  };
}

// Decorator stage 2: render the message through the level-specific styler
// and emit it to the runtime stream (stdout for info/warn/success, stderr
// for error).
function withConsoleStyle(level: LogLevel, next: Sink): Sink {
  const styler = stylerForLevel(level);
  const stream: "log" | "error" = level === "error" ? "error" : "log";
  return (message, runtime) => {
    runtime[stream](styler(message));
    next(message, runtime);
  };
}

// Decorator stage 3: forward the raw (unstyled) message to the structured
// file logger. This is the final sink, so it does not call `next`.
function withStructuredForward(level: LogLevel): Sink {
  const method = subsystemMethodForLevel(level);
  return (message) => {
    getLogger()[method](message);
  };
}

// Compose the pipeline for a given level once at module load.
function composeSink(level: LogLevel): Sink {
  return withSubsystemRouting(withConsoleStyle(level, withStructuredForward(level)));
}

// AsyncLocalStorage-style "current level" context so the subsystem-routing
// stage can pick the right method when it short-circuits the pipeline.
let activeLevel: LogLevel = "info";

function currentLevel(): LogLevel {
  return activeLevel;
}

function subsystemMethodForLevel(level: LogLevel): "info" | "warn" | "error" {
  if (level === "warn") return "warn";
  if (level === "error") return "error";
  return "info";
}

function stylerForLevel(level: LogLevel): (message: string) => string {
  if (level === "warn") return warn;
  if (level === "error") return danger;
  if (level === "success") return success;
  return info;
}

const sinks: Record<LogLevel, Sink> = {
  info: composeSink("info"),
  warn: composeSink("warn"),
  success: composeSink("success"),
  error: composeSink("error"),
};

function emit(level: LogLevel, message: string, runtime: RuntimeEnv) {
  const previous = activeLevel;
  activeLevel = level;
  try {
    sinks[level](message, runtime);
  } finally {
    activeLevel = previous;
  }
}

export function logInfo(message: string, runtime: RuntimeEnv = defaultRuntime) {
  emit("info", message, runtime);
}

export function logWarn(message: string, runtime: RuntimeEnv = defaultRuntime) {
  emit("warn", message, runtime);
}

export function logSuccess(message: string, runtime: RuntimeEnv = defaultRuntime) {
  emit("success", message, runtime);
}

export function logError(message: string, runtime: RuntimeEnv = defaultRuntime) {
  emit("error", message, runtime);
}

export function logDebug(message: string) {
  // Always emit to file logger (level-filtered); console only when verbose.
  getLogger().debug(message);
  logVerboseConsole(message);
}
