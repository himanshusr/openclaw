/**
 * Builder for the configure phase of `createExecTool`.
 *
 * Before this PR, `createExecTool` (in `bash-tools.exec.ts`) opened with
 * a serial chain of inline normalization steps -- clamp the background
 * timeout, normalize the path-prepend, resolve safe-bins, parse the
 * agent session key, etc. -- before constructing the agent tool. The
 * configure-phase had no name and was tangled into the tool factory's
 * outer closure, which made it impossible to unit-test the
 * normalization rules in isolation ("given `defaults.timeoutSec = -5`,
 * what is the resolved timeout?").
 *
 * `ExecToolBuilder` lifts that configure phase into a fluent Builder
 * with one `with*()` method per logical group. Each method does the
 * existing clamp / normalize work, returns `this`, and contributes to a
 * private partial config; `build()` returns a frozen `ExecToolConfig`
 * value object that the executor consumes.
 *
 * The runtime `execute` callback in `bash-tools.exec.ts` is intentionally
 * NOT split here -- per the issue Non-goals, splitting the runtime
 * branches (elevated path, PTY fallback, approval flow) is a separate
 * larger refactor. This PR only owns the configure phase.
 */

import type { ExecToolDefaults } from "./bash-tools.exec.types.js";
import { resolveSafeBins } from "../infra/exec-approvals.js";
import { parseAgentSessionKey, resolveAgentIdFromSessionKey } from "../routing/session-key.js";
import { clampNumber, readEnvInt } from "./bash-tools.shared.js";

// Inlined here (rather than imported from bash-tools.exec.ts) to avoid a
// circular module load: bash-tools.exec.ts imports this file at module-eval
// time to call buildExecToolConfigFromDefaults() inside createExecTool.
const DEFAULT_APPROVAL_RUNNING_NOTICE_MS_INTERNAL = 60_000;

function normalizePathPrependInternal(entries?: string[]): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function resolveApprovalRunningNoticeMsInternal(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_APPROVAL_RUNNING_NOTICE_MS_INTERNAL;
  }
  if (value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

/**
 * Frozen value object the executor reads from. Replaces a closure full of
 * `let`s with a typed contract between configure-time and run-time.
 */
export type ExecToolConfig = Readonly<{
  defaultBackgroundMs: number;
  allowBackground: boolean;
  defaultTimeoutSec: number;
  defaultPathPrepend: string[];
  safeBins: string[];
  notifyOnExit: boolean;
  notifySessionKey: string | undefined;
  approvalRunningNoticeMs: number;
  agentId: string | undefined;
}>;

/**
 * Fluent builder. Each `with*()` covers one logical group of the existing
 * inline configure code; the method names give the configure phase the
 * vocabulary it was missing before this PR.
 */
export class ExecToolBuilder {
  // The partial holds everything we have decided so far. `build()` fills
  // any unset slots with the same defaults the legacy inline code used.
  private partial: Partial<{
    defaultBackgroundMs: number;
    allowBackground: boolean;
    defaultTimeoutSec: number;
    defaultPathPrepend: string[];
    safeBins: string[];
    notifyOnExit: boolean;
    notifySessionKey: string | undefined;
    approvalRunningNoticeMs: number;
    agentId: string | undefined;
  }> = {};

  withTimeouts(opts: {
    backgroundMs?: number;
    timeoutSec?: number;
    allowBackground?: boolean;
  }): this {
    this.partial.defaultBackgroundMs = clampNumber(
      opts.backgroundMs ?? readEnvInt("PI_BASH_YIELD_MS"),
      10_000,
      10,
      120_000,
    );
    this.partial.defaultTimeoutSec =
      typeof opts.timeoutSec === "number" && opts.timeoutSec > 0 ? opts.timeoutSec : 1800;
    this.partial.allowBackground = opts.allowBackground ?? true;
    return this;
  }

  withSandbox(opts: { pathPrepend?: string[]; safeBins?: string[] }): this {
    this.partial.defaultPathPrepend = normalizePathPrependInternal(opts.pathPrepend);
    this.partial.safeBins = resolveSafeBins(opts.safeBins);
    return this;
  }

  withApproval(opts: { approvalRunningNoticeMs?: number }): this {
    this.partial.approvalRunningNoticeMs = resolveApprovalRunningNoticeMsInternal(
      opts.approvalRunningNoticeMs,
    );
    return this;
  }

  withNotifications(opts: { notifyOnExit?: boolean; sessionKey?: string }): this {
    this.partial.notifyOnExit = opts.notifyOnExit !== false;
    this.partial.notifySessionKey = opts.sessionKey?.trim() || undefined;
    return this;
  }

  withSessionContext(opts: { agentId?: string; sessionKey?: string }): this {
    const parsed = parseAgentSessionKey(opts.sessionKey);
    this.partial.agentId =
      opts.agentId ?? (parsed ? resolveAgentIdFromSessionKey(opts.sessionKey) : undefined);
    return this;
  }

  build(): ExecToolConfig {
    return Object.freeze({
      defaultBackgroundMs:
        this.partial.defaultBackgroundMs ??
        clampNumber(readEnvInt("PI_BASH_YIELD_MS"), 10_000, 10, 120_000),
      allowBackground: this.partial.allowBackground ?? true,
      defaultTimeoutSec: this.partial.defaultTimeoutSec ?? 1800,
      defaultPathPrepend: this.partial.defaultPathPrepend ?? [],
      safeBins: this.partial.safeBins ?? resolveSafeBins(undefined),
      notifyOnExit: this.partial.notifyOnExit ?? true,
      notifySessionKey: this.partial.notifySessionKey,
      approvalRunningNoticeMs:
        this.partial.approvalRunningNoticeMs ?? resolveApprovalRunningNoticeMsInternal(undefined),
      agentId: this.partial.agentId,
    });
  }
}

/**
 * Convenience factory that mirrors the legacy inline configure-phase 1:1.
 * Used inside `createExecTool` so the call site reads as one line instead
 * of seven.
 */
export function buildExecToolConfigFromDefaults(defaults?: ExecToolDefaults): ExecToolConfig {
  return new ExecToolBuilder()
    .withTimeouts({
      backgroundMs: defaults?.backgroundMs,
      timeoutSec: defaults?.timeoutSec,
      allowBackground: defaults?.allowBackground,
    })
    .withSandbox({ pathPrepend: defaults?.pathPrepend, safeBins: defaults?.safeBins })
    .withApproval({ approvalRunningNoticeMs: defaults?.approvalRunningNoticeMs })
    .withNotifications({ notifyOnExit: defaults?.notifyOnExit, sessionKey: defaults?.sessionKey })
    .withSessionContext({ agentId: defaults?.agentId, sessionKey: defaults?.sessionKey })
    .build();
}
