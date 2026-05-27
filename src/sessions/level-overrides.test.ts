import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import { applyVerboseOverride, parseVerboseOverride } from "./level-overrides.js";

/**
 * Tests for verbose level overrides
 *
 * Verbose level overrides control the verbosity of agent responses per session.
 * Supported levels: "on" | "off"
 */

describe("parseVerboseOverride", () => {
  describe("valid verbose levels", () => {
    it("parses 'on' as on", () => {
      const result = parseVerboseOverride("on");

      expect(result).toEqual({
        ok: true,
        value: "on",
      });
    });

    it("parses 'off' as off", () => {
      const result = parseVerboseOverride("off");

      expect(result).toEqual({
        ok: true,
        value: "off",
      });
    });

    it("parses null as null", () => {
      const result = parseVerboseOverride(null);

      expect(result).toEqual({
        ok: true,
        value: null,
      });
    });

    it("parses undefined as undefined", () => {
      const result = parseVerboseOverride(undefined);

      expect(result).toEqual({
        ok: true,
        value: undefined,
      });
    });
  });

  describe("case normalization", () => {
    it("normalizes 'ON' to on", () => {
      const result = parseVerboseOverride("ON");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe("on");
    });

    it("normalizes 'OFF' to off", () => {
      const result = parseVerboseOverride("OFF");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe("off");
    });

    it("normalizes 'On' to on", () => {
      const result = parseVerboseOverride("On");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe("on");
    });

    it("normalizes 'oFf' to off", () => {
      const result = parseVerboseOverride("oFf");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe("off");
    });
  });

  describe("invalid verbose levels", () => {
    it("rejects number", () => {
      const result = parseVerboseOverride(123);

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects boolean true", () => {
      const result = parseVerboseOverride(true);

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects boolean false", () => {
      const result = parseVerboseOverride(false);

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects object", () => {
      const result = parseVerboseOverride({ level: "on" });

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects array", () => {
      const result = parseVerboseOverride(["on"]);

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects empty string", () => {
      const result = parseVerboseOverride("");

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects whitespace string", () => {
      const result = parseVerboseOverride("   ");

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects invalid string 'yes'", () => {
      const result = parseVerboseOverride("yes");

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects invalid string 'no'", () => {
      const result = parseVerboseOverride("no");

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects invalid string '1'", () => {
      const result = parseVerboseOverride("1");

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects invalid string '0'", () => {
      const result = parseVerboseOverride("0");

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects invalid string 'true'", () => {
      const result = parseVerboseOverride("true");

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });

    it("rejects invalid string 'false'", () => {
      const result = parseVerboseOverride("false");

      expect(result).toEqual({
        ok: false,
        error: 'invalid verboseLevel (use "on"|"off")',
      });
    });
  });

  describe("edge cases", () => {
    it("handles 'on' with extra whitespace", () => {
      const result = parseVerboseOverride("  on  ");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe("on");
    });

    it("handles 'off' with extra whitespace", () => {
      const result = parseVerboseOverride("  off  ");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe("off");
    });
  });
});

describe("applyVerboseOverride", () => {
  function createEntry(): SessionEntry {
    return {
      sessionId: "test-session",
      updatedAt: 1000,
    };
  }

  describe("setting verbose level", () => {
    it("sets verbose level to on", () => {
      const entry = createEntry();
      applyVerboseOverride(entry, "on");

      expect(entry.verboseLevel).toBe("on");
    });

    it("sets verbose level to off", () => {
      const entry = createEntry();
      applyVerboseOverride(entry, "off");

      expect(entry.verboseLevel).toBe("off");
    });

    it("updates existing verbose level from on to off", () => {
      const entry = createEntry();
      entry.verboseLevel = "on";

      applyVerboseOverride(entry, "off");

      expect(entry.verboseLevel).toBe("off");
    });

    it("updates existing verbose level from off to on", () => {
      const entry = createEntry();
      entry.verboseLevel = "off";

      applyVerboseOverride(entry, "on");

      expect(entry.verboseLevel).toBe("on");
    });

    it("overwrites existing verbose level", () => {
      const entry = createEntry();
      entry.verboseLevel = "on";

      applyVerboseOverride(entry, "on");

      expect(entry.verboseLevel).toBe("on");
    });
  });

  describe("clearing verbose level", () => {
    it("deletes verbose level when null provided", () => {
      const entry = createEntry();
      entry.verboseLevel = "on";

      applyVerboseOverride(entry, null);

      expect(entry.verboseLevel).toBeUndefined();
    });

    it("does nothing when null and already not set", () => {
      const entry = createEntry();

      applyVerboseOverride(entry, null);

      expect(entry.verboseLevel).toBeUndefined();
    });

    it("clears verbose level set to off", () => {
      const entry = createEntry();
      entry.verboseLevel = "off";

      applyVerboseOverride(entry, null);

      expect(entry.verboseLevel).toBeUndefined();
    });
  });

  describe("undefined behavior", () => {
    it("does not modify entry when undefined provided", () => {
      const entry = createEntry();
      entry.verboseLevel = "on";

      applyVerboseOverride(entry, undefined);

      expect(entry.verboseLevel).toBe("on");
    });

    it("does not set verbose level when undefined and not already set", () => {
      const entry = createEntry();

      applyVerboseOverride(entry, undefined);

      expect(entry.verboseLevel).toBeUndefined();
    });

    it("leaves verbose level as off when undefined provided", () => {
      const entry = createEntry();
      entry.verboseLevel = "off";

      applyVerboseOverride(entry, undefined);

      expect(entry.verboseLevel).toBe("off");
    });
  });

  describe("preserving other fields", () => {
    it("preserves sessionId", () => {
      const entry = createEntry();
      applyVerboseOverride(entry, "on");

      expect(entry.sessionId).toBe("test-session");
    });

    it("preserves updatedAt", () => {
      const entry = createEntry();
      applyVerboseOverride(entry, "on");

      expect(entry.updatedAt).toBe(1000);
    });

    it("preserves other session fields", () => {
      const entry: SessionEntry = {
        sessionId: "test-session",
        updatedAt: 1000,
        channel: "discord",
        chatType: "group",
        providerOverride: "openai",
        modelOverride: "gpt-4",
      };

      applyVerboseOverride(entry, "on");

      expect(entry.channel).toBe("discord");
      expect(entry.chatType).toBe("group");
      expect(entry.providerOverride).toBe("openai");
      expect(entry.modelOverride).toBe("gpt-4");
    });
  });

  describe("multiple applications", () => {
    it("handles multiple changes in sequence", () => {
      const entry = createEntry();

      applyVerboseOverride(entry, "on");
      expect(entry.verboseLevel).toBe("on");

      applyVerboseOverride(entry, "off");
      expect(entry.verboseLevel).toBe("off");

      applyVerboseOverride(entry, null);
      expect(entry.verboseLevel).toBeUndefined();

      applyVerboseOverride(entry, "on");
      expect(entry.verboseLevel).toBe("on");
    });

    it("handles undefined between changes", () => {
      const entry = createEntry();

      applyVerboseOverride(entry, "on");
      expect(entry.verboseLevel).toBe("on");

      applyVerboseOverride(entry, undefined);
      expect(entry.verboseLevel).toBe("on");

      applyVerboseOverride(entry, "off");
      expect(entry.verboseLevel).toBe("off");
    });
  });

  describe("edge cases", () => {
    it("does not create verbose level field for undefined", () => {
      const entry = createEntry();
      applyVerboseOverride(entry, undefined);

      expect("verboseLevel" in entry).toBe(false);
    });

    it("removes verbose level property completely with null", () => {
      const entry = createEntry();
      entry.verboseLevel = "on";

      applyVerboseOverride(entry, null);

      expect("verboseLevel" in entry).toBe(false);
    });
  });
});
