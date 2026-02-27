import { describe, expect, it } from "vitest";
import { buildCodeSpanIndex, createInlineCodeState } from "./code-spans.js";

/**
 * Tests for code span detection
 *
 * This module detects inline code spans (backtick-delimited) and code fences,
 * providing an index to check if a position is inside code.
 */

describe("buildCodeSpanIndex", () => {
  describe("inline code spans", () => {
    it("detects single inline code span", () => {
      const index = buildCodeSpanIndex("Use `code` here");

      expect(index.isInside(4)).toBe(false); // before backtick
      expect(index.isInside(5)).toBe(true); // inside code
      expect(index.isInside(9)).toBe(true); // inside code
      expect(index.isInside(10)).toBe(false); // after closing backtick
    });

    it("detects multiple inline code spans", () => {
      const index = buildCodeSpanIndex("Use `code1` and `code2` here");

      expect(index.isInside(5)).toBe(true); // first span
      expect(index.isInside(12)).toBe(false); // between spans
      expect(index.isInside(17)).toBe(true); // second span
    });

    it("detects double backtick code spans", () => {
      const index = buildCodeSpanIndex("Use ``code`` here");

      expect(index.isInside(6)).toBe(true);
      expect(index.isInside(10)).toBe(true);
      expect(index.isInside(12)).toBe(false);
    });

    it("requires matching number of backticks", () => {
      const index = buildCodeSpanIndex("Use `code`` here");

      // Should not close with double backtick
      expect(index.isInside(5)).toBe(true);
      expect(index.isInside(10)).toBe(true);
      expect(index.isInside(15)).toBe(true);
    });

    it("handles triple backtick inline code", () => {
      const index = buildCodeSpanIndex("Use ```code``` here");

      expect(index.isInside(7)).toBe(true);
      expect(index.isInside(11)).toBe(true);
    });

    it("handles unclosed inline code", () => {
      const index = buildCodeSpanIndex("Use `code without closing");

      expect(index.isInside(5)).toBe(true);
      expect(index.isInside(25)).toBe(true);
      expect(index.inlineState.open).toBe(true);
      expect(index.inlineState.ticks).toBe(1);
    });
  });

  describe("code fences", () => {
    it("detects code fence block", () => {
      const text = "```\ncode block\n```";
      const index = buildCodeSpanIndex(text);

      expect(index.isInside(0)).toBe(true); // inside fence
      expect(index.isInside(5)).toBe(true); // inside fence
      expect(index.isInside(15)).toBe(true); // inside fence
    });

    it("text outside fence is not inside code", () => {
      const text = "text\n```\ncode\n```\nmore";
      const index = buildCodeSpanIndex(text);

      expect(index.isInside(2)).toBe(false); // before fence
      expect(index.isInside(8)).toBe(true); // inside fence
      expect(index.isInside(20)).toBe(false); // after fence
    });

    it("handles multiple fences", () => {
      const text = "```\ncode1\n```\ntext\n```\ncode2\n```";
      const index = buildCodeSpanIndex(text);

      expect(index.isInside(5)).toBe(true); // first fence
      expect(index.isInside(15)).toBe(false); // between fences
      expect(index.isInside(25)).toBe(true); // second fence
    });
  });

  describe("interaction between fences and inline code", () => {
    it("inline code inside fence is considered inside fence", () => {
      const text = "```\n`code`\n```";
      const index = buildCodeSpanIndex(text);

      // Everything inside the fence should be detected
      expect(index.isInside(5)).toBe(true);
      expect(index.isInside(8)).toBe(true);
    });

    it("fence markers inside inline code are ignored", () => {
      const text = "`some ``` text`";
      const index = buildCodeSpanIndex(text);

      // The entire span should be inline code, fence markers ignored
      expect(index.isInside(1)).toBe(true);
      expect(index.isInside(8)).toBe(true);
      expect(index.isInside(14)).toBe(true);
    });

    it("inline code after fence works correctly", () => {
      const text = "```\nfence\n```\nUse `code` here";
      const index = buildCodeSpanIndex(text);

      expect(index.isInside(5)).toBe(true); // inside fence
      expect(index.isInside(20)).toBe(true); // inside inline code
      expect(index.isInside(25)).toBe(false); // after inline code
    });
  });

  describe("state preservation across chunks", () => {
    it("preserves open inline code state", () => {
      const state1 = createInlineCodeState();
      const index1 = buildCodeSpanIndex("Start `code", state1);

      expect(index1.inlineState.open).toBe(true);
      expect(index1.inlineState.ticks).toBe(1);

      const index2 = buildCodeSpanIndex(" continues` here", index1.inlineState);

      expect(index2.isInside(0)).toBe(true); // still inside code
      expect(index2.isInside(10)).toBe(true); // still inside code
      expect(index2.isInside(12)).toBe(false); // after closing
      expect(index2.inlineState.open).toBe(false);
    });

    it("handles closed state correctly", () => {
      const state = createInlineCodeState();
      const index1 = buildCodeSpanIndex("`code`", state);

      expect(index1.inlineState.open).toBe(false);
      expect(index1.inlineState.ticks).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const index = buildCodeSpanIndex("");

      expect(index.isInside(0)).toBe(false);
      expect(index.inlineState.open).toBe(false);
    });

    it("handles string with no code", () => {
      const index = buildCodeSpanIndex("Just plain text");

      expect(index.isInside(0)).toBe(false);
      expect(index.isInside(5)).toBe(false);
      expect(index.isInside(14)).toBe(false);
    });

    it("handles only backticks", () => {
      const index = buildCodeSpanIndex("```");

      expect(index.isInside(0)).toBe(true);
      expect(index.inlineState.open).toBe(true);
    });

    it("handles adjacent inline code spans", () => {
      const index = buildCodeSpanIndex("`code1``code2`");

      expect(index.isInside(1)).toBe(true); // first span
      expect(index.isInside(6)).toBe(false); // between spans (one backtick)
      expect(index.isInside(8)).toBe(true); // second span
    });

    it("handles backticks at start", () => {
      const index = buildCodeSpanIndex("`code` text");

      expect(index.isInside(0)).toBe(true);
      expect(index.isInside(5)).toBe(true);
      expect(index.isInside(7)).toBe(false);
    });

    it("handles backticks at end", () => {
      const index = buildCodeSpanIndex("text `code`");

      expect(index.isInside(4)).toBe(false);
      expect(index.isInside(6)).toBe(true);
      expect(index.isInside(10)).toBe(true);
    });

    it("handles escaped backticks inside code", () => {
      const index = buildCodeSpanIndex("`code with \\` backtick`");

      // Backslash doesn't escape in this implementation
      expect(index.isInside(10)).toBe(true);
      expect(index.isInside(12)).toBe(false); // after first closing backtick
    });
  });

  describe("createInlineCodeState", () => {
    it("creates initial state with closed code", () => {
      const state = createInlineCodeState();

      expect(state.open).toBe(false);
      expect(state.ticks).toBe(0);
    });
  });

  describe("complex scenarios", () => {
    it("handles code spans with special characters", () => {
      const index = buildCodeSpanIndex("Use `<html>` and `&nbsp;` here");

      expect(index.isInside(5)).toBe(true);
      expect(index.isInside(11)).toBe(true);
      expect(index.isInside(18)).toBe(true);
    });

    it("handles code spans across newlines", () => {
      const index = buildCodeSpanIndex("Start `code\nspans\nlines`");

      expect(index.isInside(7)).toBe(true);
      expect(index.isInside(15)).toBe(true);
      expect(index.isInside(22)).toBe(true);
    });

    it("handles multiple consecutive backticks", () => {
      const index = buildCodeSpanIndex("````` five backticks");

      expect(index.isInside(0)).toBe(true);
      expect(index.inlineState.ticks).toBe(5);
    });
  });
});
