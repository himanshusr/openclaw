import { describe, expect, it, vi } from "vitest";
import { createChannelPolicyMediator } from "./policy-mediator.js";

describe("ChannelPolicyMediator.shouldProcess", () => {
  const baseCtx = {
    channel: "telegram" as const,
    scope: "dm" as const,
    senderId: "u1",
    senderName: "Alice",
    policy: { enabled: true, policy: "open" as const },
  };

  it("rejects when channel is disabled", () => {
    const mediator = createChannelPolicyMediator();
    const decision = mediator.shouldProcess({ ...baseCtx, policy: { enabled: false } });
    expect(decision).toEqual({ allowed: false, reason: "channel-disabled" });
  });

  it("rejects when scope policy is disabled", () => {
    const mediator = createChannelPolicyMediator();
    const decision = mediator.shouldProcess({
      ...baseCtx,
      policy: { enabled: true, policy: "disabled" },
    });
    expect(decision).toEqual({ allowed: false, reason: "scope-disabled" });
  });

  it("allows DMs under an open policy", () => {
    const mediator = createChannelPolicyMediator();
    const decision = mediator.shouldProcess(baseCtx);
    expect(decision.allowed).toBe(true);
  });

  it("rejects DMs not on the allowlist when policy is allowlist", () => {
    const mediator = createChannelPolicyMediator();
    const decision = mediator.shouldProcess({
      ...baseCtx,
      policy: { enabled: true, policy: "allowlist", allowFrom: ["bob"] },
      allowlistMatch: { allowed: false },
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "not-on-allowlist",
      matchedAllowlist: { allowed: false },
    });
  });

  it("allows DMs on the allowlist when policy is allowlist", () => {
    const mediator = createChannelPolicyMediator();
    const decision = mediator.shouldProcess({
      ...baseCtx,
      policy: { enabled: true, policy: "allowlist", allowFrom: ["alice"] },
      allowlistMatch: { allowed: true, matchKey: "alice", matchSource: "username" },
    });
    expect(decision.allowed).toBe(true);
  });

  it("returns needs-pairing when pairing policy and not yet paired", () => {
    const mediator = createChannelPolicyMediator();
    const decision = mediator.shouldProcess({
      ...baseCtx,
      policy: { enabled: true, policy: "pairing" },
      isPaired: false,
      allowlistMatch: { allowed: false },
    });
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ reason: "needs-pairing" });
  });

  it("allows under pairing policy when already paired", () => {
    const mediator = createChannelPolicyMediator();
    const decision = mediator.shouldProcess({
      ...baseCtx,
      policy: { enabled: true, policy: "pairing" },
      isPaired: true,
      allowlistMatch: { allowed: false },
    });
    expect(decision.allowed).toBe(true);
  });

  it("requires mention in group scope when requireMention is set", () => {
    const mediator = createChannelPolicyMediator();
    const decision = mediator.shouldProcess({
      ...baseCtx,
      scope: "group",
      policy: { enabled: true, requireMention: true },
      hasMention: false,
    });
    expect(decision).toEqual({ allowed: false, reason: "needs-mention" });
  });

  it("allows group when requireMention is set and mention is present", () => {
    const mediator = createChannelPolicyMediator();
    const decision = mediator.shouldProcess({
      ...baseCtx,
      scope: "group",
      policy: { enabled: true, requireMention: true },
      hasMention: true,
    });
    expect(decision.allowed).toBe(true);
  });

  it("allows guild scope without requireMention", () => {
    const mediator = createChannelPolicyMediator();
    const decision = mediator.shouldProcess({
      ...baseCtx,
      scope: "guild",
      policy: { enabled: true },
    });
    expect(decision.allowed).toBe(true);
  });
});

describe("ChannelPolicyMediator.sendTyping", () => {
  it("returns dispatched=false when no dispatcher registered", async () => {
    const mediator = createChannelPolicyMediator();
    const result = await mediator.sendTyping({ channel: "telegram", conversationId: "c1" });
    expect(result).toEqual({ dispatched: false });
  });

  it("invokes the registered dispatcher and returns dispatched=true", async () => {
    const mediator = createChannelPolicyMediator();
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    mediator.registerTypingDispatcher("telegram", dispatcher);
    const result = await mediator.sendTyping({ channel: "telegram", conversationId: "c1" });
    expect(result).toEqual({ dispatched: true });
    expect(dispatcher).toHaveBeenCalledWith({ channel: "telegram", conversationId: "c1" });
  });

  it("does not cross-fire dispatchers across channels", async () => {
    const mediator = createChannelPolicyMediator();
    const tg = vi.fn().mockResolvedValue(undefined);
    mediator.registerTypingDispatcher("telegram", tg);
    expect(mediator.hasTypingDispatcher("telegram")).toBe(true);
    expect(mediator.hasTypingDispatcher("discord")).toBe(false);
    await mediator.sendTyping({ channel: "discord", conversationId: "c1" });
    expect(tg).not.toHaveBeenCalled();
  });
});
