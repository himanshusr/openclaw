import { describe, expect, it, vi } from "vitest";
import {
  classifyDiscordChannelKind,
  selectDiscordCommandAuthStrategy,
  type DiscordAuthInput,
} from "./native-command-auth.js";

const sender = { id: "user-1", name: "Alice", tag: "alice#0001" };

const baseDmInput: DiscordAuthInput = {
  sender,
  dmPolicy: "open",
  dmEnabled: true,
  isGroupDm: false,
  groupDmEnabled: true,
};

describe("classifyDiscordChannelKind (#55)", () => {
  it("returns 'dm' for a direct message", () => {
    expect(classifyDiscordChannelKind({ isDirectMessage: true, isGroupDm: false })).toBe("dm");
  });

  it("returns 'group-dm' for a group DM", () => {
    expect(classifyDiscordChannelKind({ isDirectMessage: false, isGroupDm: true })).toBe(
      "group-dm",
    );
  });

  it("returns 'guild' for a guild channel", () => {
    expect(classifyDiscordChannelKind({ isDirectMessage: false, isGroupDm: false })).toBe("guild");
  });
});

describe("DmInteractionAuthorizer (#55)", () => {
  const strategy = selectDiscordCommandAuthStrategy("dm");

  it("rejects when DMs are globally disabled", async () => {
    const result = await strategy.authorize({ ...baseDmInput, dmEnabled: false });
    expect(result).toMatchObject({ allowed: false, reason: "dm-disabled" });
  });

  it("rejects when dmPolicy is 'disabled'", async () => {
    const result = await strategy.authorize({ ...baseDmInput, dmPolicy: "disabled" });
    expect(result).toMatchObject({ allowed: false, reason: "dm-disabled" });
  });

  it("allows on 'open' policy without checking allow-list", async () => {
    const result = await strategy.authorize({ ...baseDmInput, dmPolicy: "open" });
    expect(result).toEqual({ allowed: true, commandAuthorized: true });
  });

  it("allows when sender is in the DM allow-list under 'allowlist'", async () => {
    const result = await strategy.authorize({
      ...baseDmInput,
      dmPolicy: "allowlist",
      dmAllowed: true,
    });
    expect(result).toEqual({ allowed: true, commandAuthorized: true });
  });

  it("rejects on 'allowlist' when sender is not allowed", async () => {
    const result = await strategy.authorize({
      ...baseDmInput,
      dmPolicy: "allowlist",
      dmAllowed: false,
    });
    expect(result).toMatchObject({
      allowed: false,
      reason: "dm-not-allowlisted",
      ephemeral: true,
    });
  });

  it("starts a pairing flow on 'pairing' when sender not yet permitted", async () => {
    const startPairing = vi.fn(async () => ({ code: "ABC123", created: true }));
    const result = await strategy.authorize({
      ...baseDmInput,
      dmPolicy: "pairing",
      dmAllowed: false,
      startPairing,
    });
    expect(startPairing).toHaveBeenCalledWith({ sender });
    expect(result).toMatchObject({ allowed: false, reason: "dm-pairing-pending", ephemeral: true });
    if (result.allowed === false) {
      expect(result.replyMessage).toContain("Pairing code: ABC123");
      expect(result.replyMessage).toContain("Your Discord user id: user-1");
    }
  });

  it("does not re-send a pairing reply on duplicate requests (created=false)", async () => {
    const startPairing = vi.fn(async () => ({ code: "ZZZ", created: false }));
    const result = await strategy.authorize({
      ...baseDmInput,
      dmPolicy: "pairing",
      dmAllowed: false,
      startPairing,
    });
    expect(result).toMatchObject({ allowed: false, replyMessage: null });
  });
});

describe("GroupDmInteractionAuthorizer (#55)", () => {
  const strategy = selectDiscordCommandAuthStrategy("group-dm");

  it("rejects when group DMs are disabled", async () => {
    const result = await strategy.authorize({
      ...baseDmInput,
      isGroupDm: true,
      groupDmEnabled: false,
    });
    expect(result).toMatchObject({ allowed: false, reason: "group-dm-disabled" });
  });

  it("allows when group DMs are enabled", async () => {
    const result = await strategy.authorize({
      ...baseDmInput,
      isGroupDm: true,
      groupDmEnabled: true,
    });
    expect(result).toEqual({ allowed: true, commandAuthorized: true });
  });
});

describe("GuildInteractionAuthorizer (#55)", () => {
  const strategy = selectDiscordCommandAuthStrategy("guild");

  it("returns allowed (placeholder pending follow-up migration of guild path)", async () => {
    const result = await strategy.authorize(baseDmInput);
    expect(result).toEqual({ allowed: true, commandAuthorized: true });
  });
});
