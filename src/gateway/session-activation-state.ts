// 630:P3 Issue #56 -- State pattern for session activation.
//
// Session activation behavior ("should this session process this
// message?") is determined today by a conjunction of flags
// (groupActivation, requireMention, isReplyToBot, channel type)
// scattered across channel routing and command handling. Adding a new
// mode (e.g. thread-only, paused-with-queue) requires finding and
// updating every conditional that checks the current mode -- the
// Spaghetti Code shape #56 targets.
//
// SessionActivationState is the State interface. Each concrete state
// (AlwaysActiveState, MentionGatedState, PausedState) owns its own
// `shouldProcess` decision, and `transition(mode)` returns the next
// state object. /activation mention|always|paused becomes one
// transition call, not a flag mutation that downstream code has to
// re-interpret.
//
// Per the issue's Non-goals this PR limits scope to the activation
// mode itself; queue mode, sendPolicy, and persistence-side
// (sessions.patch wiring) are intentionally deferred to follow-ups.

import { resolveMentionGating } from "../channels/mention-gating.js";

export type ActivationMode = "always" | "mention" | "paused";

export type ShouldProcessInput = {
  isGroup: boolean;
  canDetectMention: boolean;
  wasMentioned: boolean;
  implicitMention?: boolean;
  shouldBypassMention?: boolean;
};

export type ShouldProcessResult = {
  process: boolean;
  /** Same value `resolveMentionGating` would produce, surfaced for
   * adapters that want to keep their existing mention-aware logging. */
  effectiveWasMentioned: boolean;
  /** Human-readable reason the state decided this way (for verbose logs). */
  reason: string;
};

export type SessionActivationState = {
  readonly mode: ActivationMode;
  shouldProcess(input: ShouldProcessInput): ShouldProcessResult;
  /**
   * Transition to a new activation mode. Returns a new state object;
   * callers are expected to replace their reference (the state objects
   * are immutable, which makes transitions auditable and safe under
   * concurrency).
   */
  transition(next: ActivationMode): SessionActivationState;
};

class AlwaysActiveState implements SessionActivationState {
  readonly mode: ActivationMode = "always";
  shouldProcess(input: ShouldProcessInput): ShouldProcessResult {
    // In always mode we still expose effectiveWasMentioned so adapters
    // that want to log "explicitly addressed" can do so, but we do not
    // gate processing on it.
    const gate = resolveMentionGating({
      requireMention: false,
      canDetectMention: input.canDetectMention,
      wasMentioned: input.wasMentioned,
      implicitMention: input.implicitMention,
      shouldBypassMention: input.shouldBypassMention,
    });
    return {
      process: true,
      effectiveWasMentioned: gate.effectiveWasMentioned,
      reason: "always-active",
    };
  }
  transition(next: ActivationMode): SessionActivationState {
    return createSessionActivationState(next);
  }
}

class MentionGatedState implements SessionActivationState {
  readonly mode: ActivationMode = "mention";
  shouldProcess(input: ShouldProcessInput): ShouldProcessResult {
    // Direct messages always process even in mention-gated mode --
    // there is no group context to gate against.
    if (!input.isGroup) {
      return {
        process: true,
        effectiveWasMentioned: true,
        reason: "mention-gated:dm",
      };
    }
    const gate = resolveMentionGating({
      requireMention: true,
      canDetectMention: input.canDetectMention,
      wasMentioned: input.wasMentioned,
      implicitMention: input.implicitMention,
      shouldBypassMention: input.shouldBypassMention,
    });
    return {
      process: !gate.shouldSkip,
      effectiveWasMentioned: gate.effectiveWasMentioned,
      reason: gate.shouldSkip ? "mention-gated:no-mention" : "mention-gated:mentioned",
    };
  }
  transition(next: ActivationMode): SessionActivationState {
    return createSessionActivationState(next);
  }
}

class PausedState implements SessionActivationState {
  readonly mode: ActivationMode = "paused";
  shouldProcess(_input: ShouldProcessInput): ShouldProcessResult {
    return {
      process: false,
      effectiveWasMentioned: false,
      reason: "paused",
    };
  }
  transition(next: ActivationMode): SessionActivationState {
    return createSessionActivationState(next);
  }
}

/**
 * Factory for the State machine. Called by sessions.patch handlers
 * when /activation mention|always|paused fires.
 */
export function createSessionActivationState(mode: ActivationMode): SessionActivationState {
  if (mode === "always") return new AlwaysActiveState();
  if (mode === "paused") return new PausedState();
  return new MentionGatedState();
}
