import { describe, expect, it } from "vitest";
import { parseSessionLabel, SESSION_LABEL_MAX_LENGTH } from "./session-label.js";

/**
 * Tests for session label parsing and validation
 *
 * Session labels are user-friendly names for sessions with validation rules:
 * - Must be a string
 * - Cannot be empty or whitespace-only
 * - Maximum length of 64 characters
 */

describe("parseSessionLabel", () => {
  describe("valid labels", () => {
    it("accepts simple label", () => {
      const result = parseSessionLabel("Work Session");

      expect(result).toEqual({
        ok: true,
        label: "Work Session",
      });
    });

    it("accepts single character label", () => {
      const result = parseSessionLabel("A");

      expect(result).toEqual({
        ok: true,
        label: "A",
      });
    });

    it("accepts label with numbers", () => {
      const result = parseSessionLabel("Session 123");

      expect(result).toEqual({
        ok: true,
        label: "Session 123",
      });
    });

    it("accepts label with special characters", () => {
      const result = parseSessionLabel("Work-Session_2024");

      expect(result).toEqual({
        ok: true,
        label: "Work-Session_2024",
      });
    });

    it("accepts label with emoji", () => {
      const result = parseSessionLabel("🚀 Launch Session");

      expect(result).toEqual({
        ok: true,
        label: "🚀 Launch Session",
      });
    });

    it("trims whitespace from label", () => {
      const result = parseSessionLabel("  Work Session  ");

      expect(result).toEqual({
        ok: true,
        label: "Work Session",
      });
    });

    it("accepts label at max length", () => {
      const label = "A".repeat(SESSION_LABEL_MAX_LENGTH);
      const result = parseSessionLabel(label);

      expect(result).toEqual({
        ok: true,
        label,
      });
    });

    it("accepts label with newlines (trimmed)", () => {
      const result = parseSessionLabel("\nWork Session\n");

      expect(result).toEqual({
        ok: true,
        label: "Work Session",
      });
    });

    it("accepts label with tabs (trimmed)", () => {
      const result = parseSessionLabel("\tWork Session\t");

      expect(result).toEqual({
        ok: true,
        label: "Work Session",
      });
    });

    it("accepts label with unicode characters", () => {
      const result = parseSessionLabel("Sesión de Trabajo");

      expect(result).toEqual({
        ok: true,
        label: "Sesión de Trabajo",
      });
    });

    it("accepts label with punctuation", () => {
      const result = parseSessionLabel("Q&A Session: Part 1!");

      expect(result).toEqual({
        ok: true,
        label: "Q&A Session: Part 1!",
      });
    });
  });

  describe("invalid labels - type errors", () => {
    it("rejects number", () => {
      const result = parseSessionLabel(123);

      expect(result).toEqual({
        ok: false,
        error: "invalid label: must be a string",
      });
    });

    it("rejects boolean", () => {
      const result = parseSessionLabel(true);

      expect(result).toEqual({
        ok: false,
        error: "invalid label: must be a string",
      });
    });

    it("rejects null", () => {
      const result = parseSessionLabel(null);

      expect(result).toEqual({
        ok: false,
        error: "invalid label: must be a string",
      });
    });

    it("rejects undefined", () => {
      const result = parseSessionLabel(undefined);

      expect(result).toEqual({
        ok: false,
        error: "invalid label: must be a string",
      });
    });

    it("rejects object", () => {
      const result = parseSessionLabel({ label: "test" });

      expect(result).toEqual({
        ok: false,
        error: "invalid label: must be a string",
      });
    });

    it("rejects array", () => {
      const result = parseSessionLabel(["label"]);

      expect(result).toEqual({
        ok: false,
        error: "invalid label: must be a string",
      });
    });
  });

  describe("invalid labels - empty", () => {
    it("rejects empty string", () => {
      const result = parseSessionLabel("");

      expect(result).toEqual({
        ok: false,
        error: "invalid label: empty",
      });
    });

    it("rejects whitespace only", () => {
      const result = parseSessionLabel("   ");

      expect(result).toEqual({
        ok: false,
        error: "invalid label: empty",
      });
    });

    it("rejects tabs only", () => {
      const result = parseSessionLabel("\t\t\t");

      expect(result).toEqual({
        ok: false,
        error: "invalid label: empty",
      });
    });

    it("rejects newlines only", () => {
      const result = parseSessionLabel("\n\n\n");

      expect(result).toEqual({
        ok: false,
        error: "invalid label: empty",
      });
    });

    it("rejects mixed whitespace", () => {
      const result = parseSessionLabel("  \n\t  ");

      expect(result).toEqual({
        ok: false,
        error: "invalid label: empty",
      });
    });
  });

  describe("invalid labels - too long", () => {
    it("rejects label one character too long", () => {
      const label = "A".repeat(SESSION_LABEL_MAX_LENGTH + 1);
      const result = parseSessionLabel(label);

      expect(result).toEqual({
        ok: false,
        error: `invalid label: too long (max ${SESSION_LABEL_MAX_LENGTH})`,
      });
    });

    it("rejects label significantly too long", () => {
      const label = "A".repeat(SESSION_LABEL_MAX_LENGTH + 100);
      const result = parseSessionLabel(label);

      expect(result).toEqual({
        ok: false,
        error: `invalid label: too long (max ${SESSION_LABEL_MAX_LENGTH})`,
      });
    });

    it("rejects label with whitespace that exceeds max after trimming", () => {
      // This should pass because trimming brings it to max length
      const label = "   " + "A".repeat(SESSION_LABEL_MAX_LENGTH) + "   ";
      const result = parseSessionLabel(label);

      expect(result.ok).toBe(true);
    });

    it("rejects label with emoji that exceeds max", () => {
      // Emoji can be multiple bytes
      const label = "🚀".repeat(SESSION_LABEL_MAX_LENGTH + 1);
      const result = parseSessionLabel(label);

      expect(result).toEqual({
        ok: false,
        error: `invalid label: too long (max ${SESSION_LABEL_MAX_LENGTH})`,
      });
    });
  });

  describe("edge cases", () => {
    it("accepts label with internal whitespace", () => {
      const result = parseSessionLabel("Work   Session   Today");

      expect(result).toEqual({
        ok: true,
        label: "Work   Session   Today",
      });
    });

    it("accepts label with only special characters", () => {
      const result = parseSessionLabel("!@#$%^&*()");

      expect(result).toEqual({
        ok: true,
        label: "!@#$%^&*())",
      });
    });

    it("accepts label with mixed language characters", () => {
      const result = parseSessionLabel("Session 会議 会话");

      expect(result).toEqual({
        ok: true,
        label: "Session 会議 会话",
      });
    });

    it("trims to exactly max length", () => {
      const label = " " + "A".repeat(SESSION_LABEL_MAX_LENGTH - 1) + " ";
      const result = parseSessionLabel(label);

      expect(result.ok).toBe(true);
      expect(result.ok && result.label.length).toBe(SESSION_LABEL_MAX_LENGTH - 1);
    });

    it("handles label with zero-width characters", () => {
      const label = "Test\u200BSession"; // zero-width space
      const result = parseSessionLabel(label);

      expect(result.ok).toBe(true);
      expect(result.ok && result.label).toContain("\u200B");
    });
  });

  describe("boundary testing", () => {
    it("accepts label at max length minus 1", () => {
      const label = "A".repeat(SESSION_LABEL_MAX_LENGTH - 1);
      const result = parseSessionLabel(label);

      expect(result.ok).toBe(true);
    });

    it("accepts label at max length", () => {
      const label = "A".repeat(SESSION_LABEL_MAX_LENGTH);
      const result = parseSessionLabel(label);

      expect(result.ok).toBe(true);
    });

    it("rejects label at max length plus 1", () => {
      const label = "A".repeat(SESSION_LABEL_MAX_LENGTH + 1);
      const result = parseSessionLabel(label);

      expect(result.ok).toBe(false);
    });
  });
});
