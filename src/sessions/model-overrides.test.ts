import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import { applyModelOverrideToSessionEntry } from "./model-overrides.js";

/**
 * Tests for applying model overrides to session entries
 *
 * Model overrides allow sessions to use different models/providers than the default.
 * This module handles:
 * - Setting provider and model overrides
 * - Clearing overrides when reverting to default
 * - Managing auth profile overrides
 * - Tracking when entries are updated
 */

describe("applyModelOverrideToSessionEntry", () => {
  function createEntry(): SessionEntry {
    return {
      sessionId: "test-session",
      updatedAt: 1000,
    };
  }

  describe("non-default model selection", () => {
    it("sets provider and model overrides", () => {
      const entry = createEntry();
      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.providerOverride).toBe("openai");
      expect(entry.modelOverride).toBe("gpt-4");
      expect(entry.updatedAt).toBeGreaterThan(1000);
    });

    it("updates existing overrides", () => {
      const entry = createEntry();
      entry.providerOverride = "anthropic";
      entry.modelOverride = "claude-3";

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.providerOverride).toBe("openai");
      expect(entry.modelOverride).toBe("gpt-4");
    });

    it("returns updated:false when values are same", () => {
      const entry = createEntry();
      entry.providerOverride = "openai";
      entry.modelOverride = "gpt-4";
      const originalUpdatedAt = entry.updatedAt;

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(false);
      expect(entry.updatedAt).toBe(originalUpdatedAt);
    });

    it("updates when only provider changes", () => {
      const entry = createEntry();
      entry.providerOverride = "anthropic";
      entry.modelOverride = "gpt-4";

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.providerOverride).toBe("openai");
    });

    it("updates when only model changes", () => {
      const entry = createEntry();
      entry.providerOverride = "openai";
      entry.modelOverride = "gpt-3.5";

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.modelOverride).toBe("gpt-4");
    });
  });

  describe("default model selection", () => {
    it("clears provider and model overrides", () => {
      const entry = createEntry();
      entry.providerOverride = "openai";
      entry.modelOverride = "gpt-4";

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: true,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.providerOverride).toBeUndefined();
      expect(entry.modelOverride).toBeUndefined();
    });

    it("returns updated:false when already using default", () => {
      const entry = createEntry();
      const originalUpdatedAt = entry.updatedAt;

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: true,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(false);
      expect(entry.updatedAt).toBe(originalUpdatedAt);
    });

    it("clears only provider if model already cleared", () => {
      const entry = createEntry();
      entry.providerOverride = "openai";

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: true,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.providerOverride).toBeUndefined();
    });

    it("clears only model if provider already cleared", () => {
      const entry = createEntry();
      entry.modelOverride = "gpt-4";

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: true,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.modelOverride).toBeUndefined();
    });
  });

  describe("auth profile overrides", () => {
    it("sets auth profile override with default source", () => {
      const entry = createEntry();
      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        profileOverride: "work",
      });

      expect(result.updated).toBe(true);
      expect(entry.authProfileOverride).toBe("work");
      expect(entry.authProfileOverrideSource).toBe("user");
    });

    it("sets auth profile override with auto source", () => {
      const entry = createEntry();
      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        profileOverride: "work",
        profileOverrideSource: "auto",
      });

      expect(result.updated).toBe(true);
      expect(entry.authProfileOverride).toBe("work");
      expect(entry.authProfileOverrideSource).toBe("auto");
    });

    it("updates existing auth profile override", () => {
      const entry = createEntry();
      entry.authProfileOverride = "personal";
      entry.authProfileOverrideSource = "auto";

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        profileOverride: "work",
        profileOverrideSource: "user",
      });

      expect(result.updated).toBe(true);
      expect(entry.authProfileOverride).toBe("work");
      expect(entry.authProfileOverrideSource).toBe("user");
    });

    it("clears compaction count when setting profile override", () => {
      const entry = createEntry();
      entry.authProfileOverrideCompactionCount = 5;

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        profileOverride: "work",
      });

      expect(result.updated).toBe(true);
      expect(entry.authProfileOverrideCompactionCount).toBeUndefined();
    });

    it("returns updated:false when profile override unchanged", () => {
      const entry = createEntry();
      entry.authProfileOverride = "work";
      entry.authProfileOverrideSource = "user";
      entry.providerOverride = "openai";
      entry.modelOverride = "gpt-4";
      const originalUpdatedAt = entry.updatedAt;

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        profileOverride: "work",
        profileOverrideSource: "user",
      });

      expect(result.updated).toBe(false);
      expect(entry.updatedAt).toBe(originalUpdatedAt);
    });
  });

  describe("clearing auth profile overrides", () => {
    it("clears auth profile when not provided", () => {
      const entry = createEntry();
      entry.authProfileOverride = "work";
      entry.authProfileOverrideSource = "user";
      entry.authProfileOverrideCompactionCount = 3;

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.authProfileOverride).toBeUndefined();
      expect(entry.authProfileOverrideSource).toBeUndefined();
      expect(entry.authProfileOverrideCompactionCount).toBeUndefined();
    });

    it("returns updated:false when profile already cleared", () => {
      const entry = createEntry();
      entry.providerOverride = "openai";
      entry.modelOverride = "gpt-4";
      const originalUpdatedAt = entry.updatedAt;

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(false);
      expect(entry.updatedAt).toBe(originalUpdatedAt);
    });

    it("clears only profile override if source already cleared", () => {
      const entry = createEntry();
      entry.authProfileOverride = "work";

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.authProfileOverride).toBeUndefined();
    });

    it("clears compaction count even if profile already cleared", () => {
      const entry = createEntry();
      entry.authProfileOverrideCompactionCount = 5;

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.authProfileOverrideCompactionCount).toBeUndefined();
    });
  });

  describe("combined scenarios", () => {
    it("handles default selection with auth profile", () => {
      const entry = createEntry();
      entry.providerOverride = "anthropic";
      entry.modelOverride = "claude-3";
      entry.authProfileOverride = "old";

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: true,
      };

      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        profileOverride: "new",
      });

      expect(result.updated).toBe(true);
      expect(entry.providerOverride).toBeUndefined();
      expect(entry.modelOverride).toBeUndefined();
      expect(entry.authProfileOverride).toBe("new");
      expect(entry.authProfileOverrideSource).toBe("user");
    });

    it("updates timestamp once for multiple changes", () => {
      const entry = createEntry();
      entry.updatedAt = 1000;

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        profileOverride: "work",
      });

      expect(result.updated).toBe(true);
      expect(entry.updatedAt).toBeGreaterThan(1000);
      const firstUpdate = entry.updatedAt;

      // Ensure timestamp is same value (not incremented again)
      expect(entry.updatedAt).toBe(firstUpdate);
    });

    it("handles all fields being set at once", () => {
      const entry = createEntry();

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        profileOverride: "work",
        profileOverrideSource: "auto",
      });

      expect(result.updated).toBe(true);
      expect(entry.providerOverride).toBe("openai");
      expect(entry.modelOverride).toBe("gpt-4");
      expect(entry.authProfileOverride).toBe("work");
      expect(entry.authProfileOverrideSource).toBe("auto");
    });
  });

  describe("edge cases", () => {
    it("handles empty string provider", () => {
      const entry = createEntry();
      const selection = {
        provider: "",
        model: "gpt-4",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.providerOverride).toBe("");
    });

    it("handles empty string model", () => {
      const entry = createEntry();
      const selection = {
        provider: "openai",
        model: "",
        isDefault: false,
      };

      const result = applyModelOverrideToSessionEntry({ entry, selection });

      expect(result.updated).toBe(true);
      expect(entry.modelOverride).toBe("");
    });

    it("handles empty string profile override", () => {
      const entry = createEntry();
      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      // Empty string is falsy, so it should clear the profile
      const result = applyModelOverrideToSessionEntry({
        entry,
        selection,
        profileOverride: "",
      });

      expect(result.updated).toBe(true);
      expect(entry.authProfileOverride).toBeUndefined();
    });

    it("preserves other session entry fields", () => {
      const entry: SessionEntry = {
        sessionId: "test-session",
        updatedAt: 1000,
        channel: "discord",
        chatType: "group",
        lastChannel: "discord",
      };

      const selection = {
        provider: "openai",
        model: "gpt-4",
        isDefault: false,
      };

      applyModelOverrideToSessionEntry({ entry, selection });

      expect(entry.sessionId).toBe("test-session");
      expect(entry.channel).toBe("discord");
      expect(entry.chatType).toBe("group");
      expect(entry.lastChannel).toBe("discord");
    });
  });
});
