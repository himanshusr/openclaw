import { describe, expect, it } from "vitest";
import { findFenceSpanAt, isSafeFenceBreak, parseFenceSpans } from "./fences.js";

/**
 * Tests for fence span parsing
 *
 * This module parses markdown code fences (```/~~~ blocks) and tracks their positions.
 * Used to determine if text is inside a code block for proper formatting.
 */

describe("parseFenceSpans", () => {
  describe("basic fence parsing", () => {
    it("parses single backtick fence", () => {
      const spans = parseFenceSpans("```\ncode\n```");

      expect(spans).toHaveLength(1);
      expect(spans[0]).toMatchObject({
        start: 0,
        end: 11,
        marker: "```",
        openLine: "```",
      });
    });

    it("parses single tilde fence", () => {
      const spans = parseFenceSpans("~~~\ncode\n~~~");

      expect(spans).toHaveLength(1);
      expect(spans[0]).toMatchObject({
        start: 0,
        end: 11,
        marker: "~~~",
      });
    });

    it("parses fence with language specifier", () => {
      const spans = parseFenceSpans("```javascript\ncode\n```");

      expect(spans).toHaveLength(1);
      expect(spans[0]).toMatchObject({
        start: 0,
        openLine: "```javascript",
        marker: "```",
      });
    });

    it("parses multiple fences", () => {
      const text = "```\ncode1\n```\ntext\n```\ncode2\n```";
      const spans = parseFenceSpans(text);

      expect(spans).toHaveLength(2);
      expect(spans[0]?.start).toBe(0);
      expect(spans[1]?.start).toBe(19);
    });
  });

  describe("fence with indentation", () => {
    it("parses fence with no indentation", () => {
      const spans = parseFenceSpans("```\ncode\n```");

      expect(spans[0]?.indent).toBe("");
    });

    it("parses fence with 1 space indentation", () => {
      const spans = parseFenceSpans(" ```\ncode\n ```");

      expect(spans[0]?.indent).toBe(" ");
    });

    it("parses fence with 2 space indentation", () => {
      const spans = parseFenceSpans("  ```\ncode\n  ```");

      expect(spans[0]?.indent).toBe("  ");
    });

    it("parses fence with 3 space indentation", () => {
      const spans = parseFenceSpans("   ```\ncode\n   ```");

      expect(spans[0]?.indent).toBe("   ");
    });

    it("does not parse fence with 4+ space indentation", () => {
      const spans = parseFenceSpans("    ```\ncode\n    ```");

      expect(spans).toHaveLength(0);
    });
  });

  describe("fence marker matching", () => {
    it("requires matching fence markers", () => {
      const spans = parseFenceSpans("```\ncode\n~~~");

      expect(spans).toHaveLength(0);
    });

    it("allows longer closing fence", () => {
      const spans = parseFenceSpans("```\ncode\n`````");

      expect(spans).toHaveLength(1);
    });

    it("does not close with shorter fence", () => {
      const spans = parseFenceSpans("````\ncode\n```\nmore");

      expect(spans).toHaveLength(1);
      expect(spans[0]?.end).toBe(spans[0]?.start + "````\ncode\n```\nmore".length);
    });

    it("parses four backtick fence", () => {
      const spans = parseFenceSpans("````\ncode\n````");

      expect(spans).toHaveLength(1);
      expect(spans[0]?.marker).toBe("````");
    });

    it("parses long fence markers", () => {
      const spans = parseFenceSpans("``````\ncode\n``````");

      expect(spans).toHaveLength(1);
      expect(spans[0]?.marker).toBe("``````");
    });
  });

  describe("unclosed fences", () => {
    it("extends unclosed fence to end of buffer", () => {
      const text = "```\ncode without closing";
      const spans = parseFenceSpans(text);

      expect(spans).toHaveLength(1);
      expect(spans[0]?.start).toBe(0);
      expect(spans[0]?.end).toBe(text.length);
    });

    it("handles multiple unclosed fences", () => {
      const text = "```\ncode1\n```\ntext\n~~~\ncode2";
      const spans = parseFenceSpans(text);

      expect(spans).toHaveLength(2);
      expect(spans[1]?.end).toBe(text.length);
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const spans = parseFenceSpans("");

      expect(spans).toEqual([]);
    });

    it("handles string with no fences", () => {
      const spans = parseFenceSpans("Just plain text\nwith newlines");

      expect(spans).toEqual([]);
    });

    it("handles fence at end without newline", () => {
      const spans = parseFenceSpans("```\ncode\n```");

      expect(spans).toHaveLength(1);
    });

    it("handles single line fence", () => {
      const spans = parseFenceSpans("```code```");

      // This should not parse as a valid fence (needs newlines)
      expect(spans).toHaveLength(0);
    });

    it("handles fence with empty content", () => {
      const spans = parseFenceSpans("```\n```");

      expect(spans).toHaveLength(1);
      expect(spans[0]?.start).toBe(0);
    });

    it("handles nested fence-like content", () => {
      const text = "```\n```inner```\n```";
      const spans = parseFenceSpans(text);

      expect(spans).toHaveLength(1);
      expect(spans[0]?.start).toBe(0);
    });

    it("handles fence with special characters in info string", () => {
      const spans = parseFenceSpans("```javascript{1-3}\ncode\n```");

      expect(spans).toHaveLength(1);
      expect(spans[0]?.openLine).toBe("```javascript{1-3}");
    });
  });

  describe("mixed backticks and tildes", () => {
    it("does not mix backtick and tilde fences", () => {
      const spans = parseFenceSpans("```\ncode\n~~~\nmore\n```");

      expect(spans).toHaveLength(1);
      // First fence should close at the matching backtick fence
    });

    it("allows separate backtick and tilde fences", () => {
      const spans = parseFenceSpans("```\ncode1\n```\n~~~\ncode2\n~~~");

      expect(spans).toHaveLength(2);
      expect(spans[0]?.marker).toBe("```");
      expect(spans[1]?.marker).toBe("~~~");
    });
  });
});

describe("findFenceSpanAt", () => {
  it("finds fence span at index inside fence", () => {
    const text = "```\ncode\n```";
    const spans = parseFenceSpans(text);
    const found = findFenceSpanAt(spans, 5);

    expect(found).toBeDefined();
    expect(found?.start).toBe(0);
  });

  it("returns undefined when index at start boundary", () => {
    const text = "```\ncode\n```";
    const spans = parseFenceSpans(text);
    const found = findFenceSpanAt(spans, 0);

    expect(found).toBeUndefined();
  });

  it("returns undefined when index at end boundary", () => {
    const text = "```\ncode\n```";
    const spans = parseFenceSpans(text);
    const found = findFenceSpanAt(spans, text.length);

    expect(found).toBeUndefined();
  });

  it("returns undefined when index outside fence", () => {
    const text = "text ```\ncode\n``` more";
    const spans = parseFenceSpans(text);
    const found = findFenceSpanAt(spans, 2);

    expect(found).toBeUndefined();
  });

  it("finds correct fence when multiple exist", () => {
    const text = "```\ncode1\n```\ntext\n```\ncode2\n```";
    const spans = parseFenceSpans(text);
    const found1 = findFenceSpanAt(spans, 5);
    const found2 = findFenceSpanAt(spans, 25);

    expect(found1).toBe(spans[0]);
    expect(found2).toBe(spans[1]);
  });
});

describe("isSafeFenceBreak", () => {
  it("returns true when index outside fence", () => {
    const text = "text ```\ncode\n``` more";
    const spans = parseFenceSpans(text);

    expect(isSafeFenceBreak(spans, 2)).toBe(true);
    expect(isSafeFenceBreak(spans, 20)).toBe(true);
  });

  it("returns false when index inside fence", () => {
    const text = "```\ncode\n```";
    const spans = parseFenceSpans(text);

    expect(isSafeFenceBreak(spans, 5)).toBe(false);
  });

  it("returns true when index at fence boundaries", () => {
    const text = "```\ncode\n```";
    const spans = parseFenceSpans(text);

    expect(isSafeFenceBreak(spans, 0)).toBe(true);
    expect(isSafeFenceBreak(spans, text.length)).toBe(true);
  });

  it("returns true for empty spans array", () => {
    expect(isSafeFenceBreak([], 0)).toBe(true);
    expect(isSafeFenceBreak([], 100)).toBe(true);
  });
});
