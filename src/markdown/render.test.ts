import { describe, expect, it } from "vitest";
import type { MarkdownIR } from "./ir.js";
import { renderMarkdownWithMarkers } from "./render.js";

/**
 * Tests for renderMarkdownWithMarkers
 *
 * This function renders markdown IR with style markers (bold, italic, code, etc.)
 * and handles complex cases like nested styles and link rendering.
 */

describe("renderMarkdownWithMarkers", () => {
  describe("basic rendering", () => {
    it("returns empty string for empty text", () => {
      const ir: MarkdownIR = {
        text: "",
        styles: [],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {},
        escapeText: (t) => t,
      });

      expect(result).toBe("");
    });

    it("returns plain text when no styles", () => {
      const ir: MarkdownIR = {
        text: "Plain text message",
        styles: [],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {},
        escapeText: (t) => t,
      });

      expect(result).toBe("Plain text message");
    });

    it("escapes text when no styles", () => {
      const ir: MarkdownIR = {
        text: "<script>alert('xss')</script>",
        styles: [],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {},
        escapeText: (t) => t.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      });

      expect(result).toBe("&lt;script&gt;alert('xss')&lt;/script&gt;");
    });
  });

  describe("single style rendering", () => {
    it("renders bold text", () => {
      const ir: MarkdownIR = {
        text: "Make this bold",
        styles: [{ style: "bold", start: 5, end: 9 }],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("Make <b>this</b> bold");
    });

    it("renders italic text", () => {
      const ir: MarkdownIR = {
        text: "Some italic text",
        styles: [{ style: "italic", start: 5, end: 11 }],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          italic: { open: "<i>", close: "</i>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("Some <i>italic</i> text");
    });

    it("renders code text", () => {
      const ir: MarkdownIR = {
        text: "Use console.log() for debugging",
        styles: [{ style: "code", start: 4, end: 15 }],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          code: { open: "<code>", close: "</code>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("Use <code>console.log</code>() for debugging");
    });

    it("renders strikethrough text", () => {
      const ir: MarkdownIR = {
        text: "This is wrong correct",
        styles: [{ style: "strikethrough", start: 8, end: 13 }],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          strikethrough: { open: "<s>", close: "</s>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("This is <s>wrong</s> correct");
    });

    it("renders spoiler text", () => {
      const ir: MarkdownIR = {
        text: "Spoiler: The ending is surprising",
        styles: [{ style: "spoiler", start: 9, end: 34 }],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          spoiler: { open: "<spoiler>", close: "</spoiler>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("Spoiler: <spoiler>The ending is surprising</spoiler>");
    });
  });

  describe("multiple styles", () => {
    it("renders multiple non-overlapping styles", () => {
      const ir: MarkdownIR = {
        text: "Bold and italic text",
        styles: [
          { style: "bold", start: 0, end: 4 },
          { style: "italic", start: 9, end: 15 },
        ],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
          italic: { open: "<i>", close: "</i>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("<b>Bold</b> and <i>italic</i> text");
    });

    it("renders multiple styles on same text", () => {
      const ir: MarkdownIR = {
        text: "Bold and italic",
        styles: [
          { style: "bold", start: 0, end: 15 },
          { style: "italic", start: 9, end: 15 },
        ],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
          italic: { open: "<i>", close: "</i>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("<b>Bold and <i>italic</i></b>");
    });
  });

  describe("nested styles", () => {
    it("handles nested bold within italic", () => {
      const ir: MarkdownIR = {
        text: "Outer italic with bold inside",
        styles: [
          { style: "italic", start: 0, end: 30 },
          { style: "bold", start: 18, end: 22 },
        ],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
          italic: { open: "<i>", close: "</i>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("<i>Outer italic with <b>bold</b> inside</i>");
    });

    it("handles code within bold", () => {
      const ir: MarkdownIR = {
        text: "Bold text with code",
        styles: [
          { style: "bold", start: 0, end: 19 },
          { style: "code", start: 15, end: 19 },
        ],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
          code: { open: "<code>", close: "</code>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("<b>Bold text with <code>code</code></b>");
    });

    it("handles multiple levels of nesting", () => {
      const ir: MarkdownIR = {
        text: "A B C D",
        styles: [
          { style: "bold", start: 0, end: 7 },
          { style: "italic", start: 2, end: 5 },
          { style: "code", start: 4, end: 5 },
        ],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
          italic: { open: "<i>", close: "</i>" },
          code: { open: "<code>", close: "</code>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("<b>A <i>B <code>C</code></i> D</b>");
    });
  });

  describe("link rendering", () => {
    it("renders link without style", () => {
      const ir: MarkdownIR = {
        text: "Visit example site",
        styles: [],
        links: [{ start: 6, end: 13, url: "https://example.com" }],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {},
        escapeText: (t) => t,
        buildLink: (link, text) => ({
          start: link.start,
          end: link.end,
          open: `<a href="${link.url}">`,
          close: "</a>",
        }),
      });

      expect(result).toBe('Visit <a href="https://example.com">example</a> site');
    });

    it("renders link with bold text", () => {
      const ir: MarkdownIR = {
        text: "Bold link",
        styles: [{ style: "bold", start: 0, end: 9 }],
        links: [{ start: 5, end: 9, url: "https://example.com" }],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
        },
        escapeText: (t) => t,
        buildLink: (link, text) => ({
          start: link.start,
          end: link.end,
          open: `<a href="${link.url}">`,
          close: "</a>",
        }),
      });

      expect(result).toBe('<b>Bold <a href="https://example.com">link</a></b>');
    });

    it("handles link with no buildLink function", () => {
      const ir: MarkdownIR = {
        text: "Click here",
        styles: [],
        links: [{ start: 6, end: 10, url: "https://example.com" }],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {},
        escapeText: (t) => t,
        // no buildLink provided
      });

      expect(result).toBe("Click here");
    });

    it("handles buildLink returning null", () => {
      const ir: MarkdownIR = {
        text: "Click here",
        styles: [],
        links: [{ start: 6, end: 10, url: "https://example.com" }],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {},
        escapeText: (t) => t,
        buildLink: () => null,
      });

      expect(result).toBe("Click here");
    });
  });

  describe("edge cases", () => {
    it("ignores styles with same start and end", () => {
      const ir: MarkdownIR = {
        text: "Text with empty style",
        styles: [{ style: "bold", start: 5, end: 5 }],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("Text with empty style");
    });

    it("ignores links with same start and end", () => {
      const ir: MarkdownIR = {
        text: "Text with empty link",
        styles: [],
        links: [{ start: 5, end: 5, url: "https://example.com" }],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {},
        escapeText: (t) => t,
        buildLink: (link) => ({
          start: link.start,
          end: link.end,
          open: `<a>`,
          close: "</a>",
        }),
      });

      expect(result).toBe("Text with empty link");
    });

    it("handles styles that span entire text", () => {
      const ir: MarkdownIR = {
        text: "All bold",
        styles: [{ style: "bold", start: 0, end: 8 }],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("<b>All bold</b>");
    });

    it("handles undefined text", () => {
      const ir: MarkdownIR = {
        text: undefined as unknown as string,
        styles: [{ style: "bold", start: 0, end: 5 }],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("");
    });

    it("handles style without corresponding marker", () => {
      const ir: MarkdownIR = {
        text: "Some text",
        styles: [{ style: "bold", start: 0, end: 4 }],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          // bold marker not provided
          italic: { open: "<i>", close: "</i>" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("Some text");
    });

    it("handles special characters in markers", () => {
      const ir: MarkdownIR = {
        text: "Bold text",
        styles: [{ style: "bold", start: 0, end: 4 }],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "**", close: "**" },
        },
        escapeText: (t) => t,
      });

      expect(result).toBe("**Bold** text");
    });

    it("escapes text in between styles", () => {
      const ir: MarkdownIR = {
        text: "Safe <unsafe> safe",
        styles: [
          { style: "bold", start: 0, end: 4 },
          { style: "italic", start: 14, end: 18 },
        ],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          bold: { open: "<b>", close: "</b>" },
          italic: { open: "<i>", close: "</i>" },
        },
        escapeText: (t) => t.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      });

      expect(result).toBe("<b>Safe</b> &lt;unsafe&gt; <i>safe</i>");
    });
  });

  describe("style priority and ordering", () => {
    it("respects style priority when overlapping", () => {
      const ir: MarkdownIR = {
        text: "Text",
        styles: [
          { style: "italic", start: 0, end: 4 },
          { style: "bold", start: 0, end: 4 },
          { style: "code", start: 0, end: 4 },
        ],
        links: [],
      };

      const result = renderMarkdownWithMarkers(ir, {
        styleMarkers: {
          code: { open: "<code>", close: "</code>" },
          bold: { open: "<b>", close: "</b>" },
          italic: { open: "<i>", close: "</i>" },
        },
        escapeText: (t) => t,
      });

      // code has highest priority, so it should be outermost
      expect(result).toBe("<code><b><i>Text</i></b></code>");
    });
  });
});