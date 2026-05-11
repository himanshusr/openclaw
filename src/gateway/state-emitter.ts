// 630:P3 Issue #58 -- Observer for config / presence propagation.
//
// Today, runtime config and presence state in the Gateway are read
// directly from a shared mutable object by multiple unrelated
// subsystems (channel adapters, the CLI, the macOS app, iOS / Android
// nodes). Any module that needs to know "is the gateway running?" or
// "what is the current model setting?" reaches into shared gateway
// state rather than subscribing to changes -- the Global State Overuse
// shape #58 targets.
//
// GatewayStateEmitter is the Subject in the Observer pattern. It owns
// the canonical "current snapshot" and broadcasts typed events
// (configChanged, presenceChanged) when state moves. Consumers
// (CLI status command, macOS node health check, channel adapters)
// subscribe via on(...) instead of polling shared state.
//
// Per the issue's Non-goals we do NOT convert every gateway state
// surface to events in this PR. We:
//   1. introduce the typed Observer infrastructure;
//   2. wire one demo publisher (config reload) and one demo consumer
//      surface (the snapshot/getter API the CLI's `gateway status`
//      reads);
//   3. leave session state and the WS protocol untouched (deferred to
//      a follow-up).

import { EventEmitter } from "node:events";
import type { OpenClawConfig } from "../config/config.js";

export type GatewayPresence = "starting" | "running" | "degraded" | "stopped";

export type GatewayConfigChange = {
  /** Previous config snapshot (deep copy at emit time). */
  prev: OpenClawConfig;
  /** Next config snapshot (deep copy at emit time). */
  next: OpenClawConfig;
  /** Diff produced by diffConfigPaths, or [] if not computed. */
  changedPaths: string[];
};

export type GatewayPresenceChange = {
  prev: GatewayPresence;
  next: GatewayPresence;
  /** Wall-clock time of the transition, ms since epoch. */
  at: number;
  /** Optional human-readable reason, e.g. "config-reload". */
  reason?: string;
};

// Typed event map for the emitter.
type GatewayStateEvents = {
  configChanged: [GatewayConfigChange];
  presenceChanged: [GatewayPresenceChange];
};

/**
 * Observer Subject. Wraps a Node EventEmitter behind a typed surface so
 * subscribers do not have to know the underlying transport. Subscribers
 * also receive the latest snapshot via `current()` for late-binding.
 */
export class GatewayStateEmitter {
  private readonly emitter = new EventEmitter();
  private config: OpenClawConfig;
  private presence: GatewayPresence;

  constructor(initial: { config: OpenClawConfig; presence?: GatewayPresence }) {
    this.config = initial.config;
    this.presence = initial.presence ?? "starting";
    // EventEmitter's default max listeners (10) is fine for the small
    // demo wiring; bump only if a future change adds many subscribers.
  }

  /** Latest known config snapshot. */
  currentConfig(): OpenClawConfig {
    return this.config;
  }

  /** Latest known presence state. */
  currentPresence(): GatewayPresence {
    return this.presence;
  }

  /**
   * Publish a config change. The emitter records `next` as the new
   * snapshot before fanning out so late subscribers see the same
   * value via `currentConfig()`.
   */
  publishConfigChange(change: GatewayConfigChange): void {
    this.config = change.next;
    this.emitter.emit("configChanged", change);
  }

  /**
   * Publish a presence change. Only emits if the new state differs
   * from the current one, so callers do not need to dedupe.
   */
  publishPresenceChange(next: GatewayPresence, opts?: { reason?: string }): void {
    if (this.presence === next) {
      return;
    }
    const change: GatewayPresenceChange = {
      prev: this.presence,
      next,
      at: Date.now(),
      reason: opts?.reason,
    };
    this.presence = next;
    this.emitter.emit("presenceChanged", change);
  }

  /** Subscribe to a typed event. Returns an unsubscribe function. */
  on<E extends keyof GatewayStateEvents>(
    event: E,
    handler: (...args: GatewayStateEvents[E]) => void,
  ): () => void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
    return () => {
      this.emitter.off(event, handler as (...args: unknown[]) => void);
    };
  }

  /** Number of active subscribers for an event (test introspection). */
  listenerCount<E extends keyof GatewayStateEvents>(event: E): number {
    return this.emitter.listenerCount(event);
  }
}
