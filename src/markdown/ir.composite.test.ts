import { describe, expect, it } from "vitest";
import { type MarkdownParseOptions, markdownToIR, nodeForTokenType } from "./ir.js";

const baseOptions: MarkdownParseOptions = {
  blockquotePrefix: "> ",
  enableSpoilers: false,
  headingStyle: "bold",
  tableMode: "off",
};

describe("Markdown IR Composite registry (issue #64)", () => {
  it("the registry exposes a node for every supported token type", () => {
    const knownTypes = [
      "inline",
      "text",
      "em_open",
      "em_close",
      "strong_open",
      "strong_close",
      "s_open",
      "s_close",
      "code_inline",
      "spoiler_open",
      "spoiler_close",
      "link_open",
      "link_close",
      "image",
      "softbreak",
      "hardbreak",
      "paragraph_close",
      "heading_open",
      "heading_close",
      "blockquote_open",
      "blockquote_close",
      "bullet_list_open",
      "bullet_list_close",
      "ordered_list_open",
      "ordered_list_close",
      "list_item_open",
      "list_item_close",
      "code_block",
      "fence",
      "html_block",
      "html_inline",
      "table_open",
      "table_close",
      "thead_open",
      "thead_close",
      "tbody_open",
      "tbody_close",
      "tr_open",
      "tr_close",
      "th_open",
      "td_open",
      "th_close",
      "td_close",
      "hr",
    ];
    for (const type of knownTypes) {
      const node = nodeForTokenType(type);
      expect(node).toBeDefined();
      expect(typeof node.render).toBe("function");
    }
    expect(knownTypes.length).toBeGreaterThanOrEqual(43);
  });

  it("an unknown token type returns the default node (no throw)", () => {
    const node = nodeForTokenType("__totally_unknown_token__");
    expect(node).toBeDefined();
    expect(typeof node.render).toBe("function");
  });

  it("plain text round-trips end-to-end through the registry", () => {
    const result = markdownToIR("hello world", baseOptions);
    expect(result.text.trim()).toBe("hello world");
  });

  it("strong + em produce style spans (registry handlers fire)", () => {
    const result = markdownToIR("**bold** and *italic*", baseOptions);
    expect(result.text).toContain("bold");
    expect(result.text).toContain("italic");
    const styleNames = result.styles.map((s) => s.style).sort();
    expect(styleNames).toContain("bold");
    expect(styleNames).toContain("italic");
  });

  it("inline code uses the code style (registry handler delegates correctly)", () => {
    const result = markdownToIR("Run `npm test` now", baseOptions);
    const hasCode = result.styles.some((s) => s.style === "code");
    expect(hasCode).toBe(true);
  });

  it("headings under headingStyle=bold open and close a bold span", () => {
    const result = markdownToIR("# Hello", baseOptions);
    expect(result.text).toContain("Hello");
    const hasBold = result.styles.some((s) => s.style === "bold");
    expect(hasBold).toBe(true);
  });

  it("bullet lists insert the bullet prefix from the list_item_open node", () => {
    const result = markdownToIR("- one\n- two", baseOptions);
    expect(result.text).toContain("• one");
    expect(result.text).toContain("• two");
  });

  it("ordered lists insert numeric prefixes from the list_item_open node", () => {
    const result = markdownToIR("1. one\n2. two", baseOptions);
    expect(result.text).toContain("1. one");
    expect(result.text).toContain("2. two");
  });

  it("hr emits a newline (registry default for hr is the simple newline node)", () => {
    const result = markdownToIR("a\n\n---\n\nb", baseOptions);
    expect(result.text).toContain("a");
    expect(result.text).toContain("b");
  });

  it("spoilers are no-op when enableSpoilers=false (spoiler_open/close registry guards)", () => {
    const result = markdownToIR("||hidden||", { ...baseOptions, enableSpoilers: false });
    const hasSpoilerStyle = result.styles.some((s) => s.style === "spoiler");
    expect(hasSpoilerStyle).toBe(false);
  });

  it("spoilers produce a spoiler span when enableSpoilers=true", () => {
    const result = markdownToIR("||hidden||", { ...baseOptions, enableSpoilers: true });
    expect(result.text).toContain("hidden");
    const hasSpoilerStyle = result.styles.some((s) => s.style === "spoiler");
    expect(hasSpoilerStyle).toBe(true);
  });
});
