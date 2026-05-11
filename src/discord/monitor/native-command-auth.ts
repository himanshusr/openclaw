// 630:P3 Issue #55 -- Strategy pattern for Discord interaction
// authorization.
//
// dispatchDiscordCommandInteraction in native-command.ts is a
// 360-line procedural function whose largest sub-cluster is the
// "should this command be allowed for this user/channel?" decision.
// That decision branches on: channel kind (DM / GroupDM / guild
// channel / thread), DM policy (open / pairing / allowlist /
// disabled), guild access groups, owner allow-list, channel allow-
// list, and per-channel enable flag -- the God Object shape #55
// targets, with policy and dispatch tangled inside the same
// procedural function.
//
// DiscordCommandAuthStrategy is the Strategy interface. Each concrete
// Authorizer (DmInteractionAuthorizer, GuildInteractionAuthorizer,
// GroupDmInteractionAuthorizer) owns its own decision. The dispatcher
// becomes a thin selector + caller -- adding a new channel type or
// new auth policy is a new strategy class, not another conditional in
// the giant function.
//
// Per the issue's Non-goals we do NOT unify Discord with
// Telegram/Slack equivalents and we do NOT redesign the
// argument-parsing layer. Per the Acceptance Criteria, behavior for
// existing commands is preserved.

export type DiscordSenderRef = {
  id: string;
  name?: string;
  tag?: string;
};

export type DiscordChannelKind = "dm" | "group-dm" | "guild";

export type DiscordAuthDecision =
  | { allowed: true; commandAuthorized: boolean }
  | {
      allowed: false;
      /** Reply message; null when the strategy already responded itself. */
      replyMessage: string | null;
      /** Whether the reply should be ephemeral (Discord-specific UX flag). */
      ephemeral?: boolean;
      /** Tag the strategy can use for verbose logging. */
      reason: string;
    };

/**
 * The Strategy interface. Each implementation owns its own
 * "should this interaction proceed?" decision based on the channel
 * kind it serves.
 */
export type DiscordCommandAuthStrategy = {
  readonly kind: DiscordChannelKind;
  authorize(input: DiscordAuthInput): Promise<DiscordAuthDecision>;
};

export type DiscordAuthInput = {
  sender: DiscordSenderRef;
  /** Resolved DM policy from discordConfig. */
  dmPolicy: "open" | "pairing" | "allowlist" | "disabled";
  /** Whether DMs are globally enabled (discordConfig.dm.enabled). */
  dmEnabled: boolean;
  /** Whether the channel is a Group DM. */
  isGroupDm: boolean;
  /** discordConfig.dm.groupEnabled ?? true */
  groupDmEnabled: boolean;
  /**
   * Test hook the DM strategy invokes when the sender is not yet
   * permitted under "pairing" mode. Returns the pairing code so the
   * caller can render a pairing reply. Strategies must remain pure of
   * Discord SDK concerns.
   */
  startPairing?: (input: { sender: DiscordSenderRef }) => Promise<{
    code: string;
    /** True when this is a fresh pairing request (not a duplicate). */
    created: boolean;
  }>;
  /** True when the sender appears in the resolved DM allow-list. */
  dmAllowed?: boolean;
};

const DM_DISABLED: DiscordAuthDecision = {
  allowed: false,
  replyMessage: "Discord DMs are disabled.",
  reason: "dm-disabled",
};

const GROUP_DM_DISABLED: DiscordAuthDecision = {
  allowed: false,
  replyMessage: "Discord group DMs are disabled.",
  reason: "group-dm-disabled",
};

class DmInteractionAuthorizer implements DiscordCommandAuthStrategy {
  readonly kind: DiscordChannelKind = "dm";
  async authorize(input: DiscordAuthInput): Promise<DiscordAuthDecision> {
    if (!input.dmEnabled || input.dmPolicy === "disabled") {
      return DM_DISABLED;
    }
    if (input.dmPolicy === "open") {
      return { allowed: true, commandAuthorized: true };
    }
    // dmPolicy === "pairing" or "allowlist"
    if (input.dmAllowed) {
      return { allowed: true, commandAuthorized: true };
    }
    if (input.dmPolicy === "pairing" && input.startPairing) {
      const { code, created } = await input.startPairing({ sender: input.sender });
      return {
        allowed: false,
        replyMessage: created ? buildPairingReplyText(input.sender.id, code) : null,
        ephemeral: true,
        reason: "dm-pairing-pending",
      };
    }
    return {
      allowed: false,
      replyMessage: "You are not authorized to use this command.",
      ephemeral: true,
      reason: "dm-not-allowlisted",
    };
  }
}

class GroupDmInteractionAuthorizer implements DiscordCommandAuthStrategy {
  readonly kind: DiscordChannelKind = "group-dm";
  async authorize(input: DiscordAuthInput): Promise<DiscordAuthDecision> {
    if (!input.groupDmEnabled) {
      return GROUP_DM_DISABLED;
    }
    return { allowed: true, commandAuthorized: true };
  }
}

class GuildInteractionAuthorizer implements DiscordCommandAuthStrategy {
  readonly kind: DiscordChannelKind = "guild";
  async authorize(_input: DiscordAuthInput): Promise<DiscordAuthDecision> {
    // Guild authorization (channel/group-policy/owner-allowlist) lives
    // in the existing dispatcher today; this strategy is a placeholder
    // for the follow-up that migrates that path. See #55 Non-goals.
    return { allowed: true, commandAuthorized: true };
  }
}

/**
 * Strategy factory: pick the authorizer for the resolved channel kind.
 * Adding a new channel kind (e.g. forum-thread) is a new strategy
 * class plus one entry here, not a new conditional in the dispatcher.
 */
export function selectDiscordCommandAuthStrategy(
  kind: DiscordChannelKind,
): DiscordCommandAuthStrategy {
  if (kind === "dm") return new DmInteractionAuthorizer();
  if (kind === "group-dm") return new GroupDmInteractionAuthorizer();
  return new GuildInteractionAuthorizer();
}

export function classifyDiscordChannelKind(input: {
  isDirectMessage: boolean;
  isGroupDm: boolean;
}): DiscordChannelKind {
  if (input.isDirectMessage) return "dm";
  if (input.isGroupDm) return "group-dm";
  return "guild";
}

function buildPairingReplyText(userId: string, code: string): string {
  // Mirrors the existing buildPairingReply shape so the migration is
  // a no-op for the user-visible reply.
  return [
    `Your Discord user id: ${userId}`,
    `Pairing code: ${code}`,
    "Send `openclaw pair discord <code>` from the gateway host to approve.",
  ].join("\n");
}
