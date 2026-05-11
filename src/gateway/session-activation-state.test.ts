import { describe, expect, it } from "vitest";
import {
  createSessionActivationState,
  type ShouldProcessInput,
} from "./session-activation-state.js";

const groupNoMention: ShouldProcessInput = {
  isGroup: true,
  canDetectMention: true,
  wasMentioned: false,
};

const groupWithMention: ShouldProcessInput = {
  isGroup: true,
  canDetectMention: true,
  wasMentioned: true,
};

const dmNoMention: ShouldProcessInput = {
  isGroup: false,
  canDetectMention: true,
  wasMentioned: false,
};

describe("SessionActivationState (#56)", () => {
  describe("AlwaysActiveState", () => {
    const state = createSessionActivationState("always");

    it("processes group messages without a mention", () => {
      const result = state.shouldProcess(groupNoMention);
      expect(result.process).toBe(true);
      expect(result.reason).toBe("always-active");
    });

    it("processes group messages with a mention", () => {
      expect(state.shouldProcess(groupWithMention).process).toBe(true);
    });

    it("processes DMs", () => {
      expect(state.shouldProcess(dmNoMention).process).toBe(true);
    });
  });

  describe("MentionGatedState", () => {
    const state = createSessionActivationState("mention");

    it("skips group messages without a mention", () => {
      const result = state.shouldProcess(groupNoMention);
      expect(result.process).toBe(false);
      expect(result.reason).toBe("mention-gated:no-mention");
    });

    it("processes group messages with an explicit mention", () => {
      const result = state.shouldProcess(groupWithMention);
      expect(result.process).toBe(true);
      expect(result.reason).toBe("mention-gated:mentioned");
    });

    it("processes group messages with an implicit mention", () => {
      const result = state.shouldProcess({ ...groupNoMention, implicitMention: true });
      expect(result.process).toBe(true);
    });

    it("always processes DMs (no group context to gate)", () => {
      const result = state.shouldProcess(dmNoMention);
      expect(result.process).toBe(true);
      expect(result.reason).toBe("mention-gated:dm");
    });

    it("processes when bypass is requested even without a mention", () => {
      const result = state.shouldProcess({ ...groupNoMention, shouldBypassMention: true });
      expect(result.process).toBe(true);
    });
  });

  describe("PausedState", () => {
    const state = createSessionActivationState("paused");

    it("never processes any message", () => {
      expect(state.shouldProcess(groupNoMention).process).toBe(false);
      expect(state.shouldProcess(groupWithMention).process).toBe(false);
      expect(state.shouldProcess(dmNoMention).process).toBe(false);
    });

    it("reports a 'paused' reason", () => {
      expect(state.shouldProcess(dmNoMention).reason).toBe("paused");
    });
  });

  describe("transitions", () => {
    it("transitions from mention -> always -> paused -> mention", () => {
      const start = createSessionActivationState("mention");
      const a = start.transition("always");
      const p = a.transition("paused");
      const m = p.transition("mention");
      expect(start.mode).toBe("mention");
      expect(a.mode).toBe("always");
      expect(p.mode).toBe("paused");
      expect(m.mode).toBe("mention");
    });

    it("returns a new state object on transition (immutability)", () => {
      const start = createSessionActivationState("mention");
      const next = start.transition("always");
      expect(next).not.toBe(start);
      expect(start.mode).toBe("mention");
      expect(next.mode).toBe("always");
    });
  });
});
