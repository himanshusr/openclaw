// 630:P3 Issue #59 -- Adapter pattern as isolation layer for the
// legacy iMessage (imsg) integration vs. the recommended BlueBubbles
// integration.
//
// OpenClaw ships two iMessage paths: BlueBubbles ("recommended") and
// the legacy `imsg` channel ("legacy macOS-only integration"). Today
// the gateway and channel docs treat both as parallel top-level
// configurations -- the Boat Anchor / Dead Code shape #59 targets:
// the legacy code keeps shipping, keeps consuming startup checks for
// users who never use it, and keeps confusing new contributors.
//
// Per the issue's Non-goals we explicitly do NOT delete the legacy
// integration -- that is a future deprecation decision. Instead we
// wrap both paths behind a common IMessageChannelAdapter so callers
// reason about "the iMessage channel" rather than "imessage vs
// bluebubbles". The legacy adapter exposes a non-null
// deprecationWarning() so gateway startup can log a clear migration
// suggestion. selectIMessageAdapter(cfg) is the small Factory that
// picks the right adapter based on what the user has configured.

import type { OpenClawConfig } from "./config/config.js";

/**
 * The kind of underlying iMessage backend an adapter wraps.
 */
export type IMessageBackendKind = "bluebubbles" | "legacy-imsg";

/**
 * Common surface shared by both iMessage backends. Today this is
 * intentionally narrow -- just the metadata and "is this configured"
 * decision the gateway needs at startup. Adopting the Adapter for
 * inbound/outbound dispatch is left for follow-ups so this PR stays
 * non-breaking for the existing channel-plugin pipeline.
 */
export type IMessageChannelAdapter = {
  /** Stable identifier of the backend wrapped by this adapter. */
  readonly backend: IMessageBackendKind;
  /** Display name suitable for status output. */
  readonly displayName: string;
  /** True iff the user has supplied enough config for this backend. */
  isConfigured(cfg: OpenClawConfig): boolean;
  /**
   * If the wrapped backend is deprecated, returns a human-readable
   * one-line warning suitable for the gateway startup log; else null.
   */
  deprecationWarning(): string | null;
};

class BlueBubblesAdapter implements IMessageChannelAdapter {
  readonly backend: IMessageBackendKind = "bluebubbles";
  readonly displayName = "BlueBubbles (iMessage)";
  isConfigured(cfg: OpenClawConfig): boolean {
    const node = (cfg.channels as Record<string, unknown> | undefined)?.bluebubbles;
    if (!node || typeof node !== "object") {
      return false;
    }
    const record = node as Record<string, unknown>;
    const serverUrl = typeof record.serverUrl === "string" ? record.serverUrl.trim() : "";
    const password = typeof record.password === "string" ? record.password.trim() : "";
    return serverUrl.length > 0 && password.length > 0;
  }
  deprecationWarning(): string | null {
    return null;
  }
}

class LegacyIMessageAdapter implements IMessageChannelAdapter {
  readonly backend: IMessageBackendKind = "legacy-imsg";
  readonly displayName = "iMessage (legacy imsg)";
  isConfigured(cfg: OpenClawConfig): boolean {
    const node = cfg.channels?.imessage;
    if (!node || typeof node !== "object") {
      return false;
    }
    const record = node as Record<string, unknown>;
    if (record.enabled === false) {
      return false;
    }
    const cliPath = typeof record.cliPath === "string" ? record.cliPath.trim() : "";
    const dbPath = typeof record.dbPath === "string" ? record.dbPath.trim() : "";
    const accounts =
      record.accounts && typeof record.accounts === "object"
        ? (record.accounts as Record<string, unknown>)
        : null;
    const hasAccount = accounts ? Object.keys(accounts).length > 0 : false;
    return cliPath.length > 0 || dbPath.length > 0 || hasAccount || record.enabled === true;
  }
  deprecationWarning(): string | null {
    return (
      "channels.imessage (legacy imsg) is deprecated; please migrate to channels.bluebubbles. " +
      "See https://docs.openclaw.ai/channels/bluebubbles for the recommended setup."
    );
  }
}

/**
 * Factory: pick the iMessage adapter for this config.
 *
 * Selection rules:
 * 1. If BlueBubbles is configured, return it (recommended path) and
 *    surface no deprecation warning regardless of legacy state.
 * 2. Else if the legacy imsg path is configured, return the legacy
 *    adapter (its deprecationWarning() is non-null).
 * 3. Else return null -- no iMessage backend is in use.
 */
export function selectIMessageAdapter(cfg: OpenClawConfig): IMessageChannelAdapter | null {
  const blue = new BlueBubblesAdapter();
  if (blue.isConfigured(cfg)) {
    return blue;
  }
  const legacy = new LegacyIMessageAdapter();
  if (legacy.isConfigured(cfg)) {
    return legacy;
  }
  return null;
}

/**
 * Convenience helper for gateway startup: returns a message to log if
 * the chosen adapter is deprecated, or null otherwise. Centralizing
 * this here means the gateway startup code never has to know the
 * difference between bluebubbles and legacy-imsg internally.
 */
export function imessageStartupWarning(cfg: OpenClawConfig): string | null {
  const adapter = selectIMessageAdapter(cfg);
  if (!adapter) return null;
  return adapter.deprecationWarning();
}
