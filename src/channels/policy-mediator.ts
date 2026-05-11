import type { AllowlistMatch } from "./allowlist-match.js";

/**
 * Channels currently understood by the policy mediator. Channel adapters
 * register themselves here so the mediator can apply consistent policy and
 * typing-indicator logic across all of them. New channels just add a string
 * here without changing call sites in adapters.
 */
export type SupportedChannelKind =
  | "telegram"
  | "discord"
  | "whatsapp"
  | "slack"
  | "signal"
  | "imessage"
  | "bluebubbles"
  | "msteams"
  | "matrix"
  | "zalo";

export type InboundScope = "dm" | "group" | "guild" | "channel";

/**
 * Policy declared per channel + scope (mirrors the per-channel config blocks
 * already in OpenClawConfig: dm.policy, dm.allowFrom, group.requireMention).
 * Centralizing the shape here means a config change only touches one place.
 */
export type ChannelPolicy = {
  enabled: boolean;
  policy?: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom?: string[];
  requireMention?: boolean;
};

export type InboundDecisionReason =
  | "channel-disabled"
  | "scope-disabled"
  | "not-on-allowlist"
  | "needs-pairing"
  | "needs-mention";

export type InboundDecision =
  | { allowed: true; matchedAllowlist?: AllowlistMatch }
  | { allowed: false; reason: InboundDecisionReason; matchedAllowlist?: AllowlistMatch };

export type InboundContext = {
  channel: SupportedChannelKind;
  scope: InboundScope;
  senderId: string;
  senderName?: string;
  policy: ChannelPolicy;
  isPaired?: boolean;
  hasMention?: boolean;
  /**
   * Pluggable allowlist matcher so channel-specific match rules
   * (Telegram tg: prefixes, Discord allow-groups) stay in their adapters
   * and the mediator just consumes the boolean result + match metadata.
   */
  allowlistMatch?: AllowlistMatch;
};

export type TypingTarget = {
  channel: SupportedChannelKind;
  conversationId: string;
};

export type TypingDispatcher = (target: TypingTarget) => Promise<void>;

export type ChannelPolicyMediator = {
  shouldProcess(ctx: InboundContext): InboundDecision;
  sendTyping(target: TypingTarget): Promise<{ dispatched: boolean }>;
  registerTypingDispatcher(channel: SupportedChannelKind, fn: TypingDispatcher): void;
  hasTypingDispatcher(channel: SupportedChannelKind): boolean;
};

export function createChannelPolicyMediator(): ChannelPolicyMediator {
  const typingDispatchers = new Map<SupportedChannelKind, TypingDispatcher>();

  return {
    shouldProcess(ctx) {
      if (!ctx.policy.enabled) {
        return { allowed: false, reason: "channel-disabled" };
      }

      if (ctx.policy.policy === "disabled") {
        return { allowed: false, reason: "scope-disabled" };
      }

      if (ctx.scope === "group" || ctx.scope === "guild" || ctx.scope === "channel") {
        if (ctx.policy.requireMention && !ctx.hasMention) {
          return { allowed: false, reason: "needs-mention" };
        }
        return { allowed: true, matchedAllowlist: ctx.allowlistMatch };
      }

      if (ctx.policy.policy === "open") {
        return { allowed: true, matchedAllowlist: ctx.allowlistMatch };
      }

      const matched = ctx.allowlistMatch?.allowed === true;
      if (matched) {
        return { allowed: true, matchedAllowlist: ctx.allowlistMatch };
      }

      if (ctx.policy.policy === "pairing") {
        if (ctx.isPaired) {
          return { allowed: true, matchedAllowlist: ctx.allowlistMatch };
        }
        return { allowed: false, reason: "needs-pairing", matchedAllowlist: ctx.allowlistMatch };
      }

      return { allowed: false, reason: "not-on-allowlist", matchedAllowlist: ctx.allowlistMatch };
    },

    async sendTyping(target) {
      const fn = typingDispatchers.get(target.channel);
      if (!fn) {
        return { dispatched: false };
      }
      await fn(target);
      return { dispatched: true };
    },

    registerTypingDispatcher(channel, fn) {
      typingDispatchers.set(channel, fn);
    },

    hasTypingDispatcher(channel) {
      return typingDispatchers.has(channel);
    },
  };
}
