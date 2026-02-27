import { describe, expect, it } from "vitest";
import { extractLinksFromMessage } from "./detect.js";

describe("extractLinksFromMessage", () => {
  describe("basic URL extraction", () => {
    it("extracts bare http/https URLs in order", () => {
      const links = extractLinksFromMessage("see https://a.example and http://b.test");
      expect(links).toEqual(["https://a.example", "http://b.test"]);
    });

    it("extracts URLs with paths and query parameters", () => {
      const links = extractLinksFromMessage(
        "https://example.com/path?param=value&other=123"
      );
      expect(links).toEqual(["https://example.com/path?param=value&other=123"]);
    });

    it("extracts URLs with fragments", () => {
      const links = extractLinksFromMessage("https://example.com/page#section");
      expect(links).toEqual(["https://example.com/page#section"]);
    });
  });

  describe("deduplication and limits", () => {
    it("dedupes links and enforces maxLinks", () => {
      const links = extractLinksFromMessage("https://a.example https://a.example https://b.test", {
        maxLinks: 1,
      });
      expect(links).toEqual(["https://a.example"]);
    });

    it("dedupes identical URLs", () => {
      const links = extractLinksFromMessage(
        "https://example.com and https://example.com again"
      );
      expect(links).toEqual(["https://example.com"]);
    });

    it("respects maxLinks=2", () => {
      const links = extractLinksFromMessage(
        "https://a.com https://b.com https://c.com https://d.com",
        { maxLinks: 2 }
      );
      expect(links).toEqual(["https://a.com", "https://b.com"]);
    });
  });

  describe("markdown link handling", () => {
    it("ignores markdown links", () => {
      const links = extractLinksFromMessage("[doc](https://docs.example) https://bare.example");
      expect(links).toEqual(["https://bare.example"]);
    });

    it("ignores multiple markdown links", () => {
      const links = extractLinksFromMessage(
        "[link1](https://one.com) text [link2](https://two.com) https://bare.com"
      );
      expect(links).toEqual(["https://bare.com"]);
    });
  });

  describe("security and filtering", () => {
    it("blocks 127.0.0.1", () => {
      const links = extractLinksFromMessage("http://127.0.0.1/test https://ok.test");
      expect(links).toEqual(["https://ok.test"]);
    });

    it("blocks non-http/https protocols", () => {
      const links = extractLinksFromMessage(
        "ftp://example.com https://valid.com"
      );
      expect(links).toEqual(["https://valid.com"]);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty string", () => {
      const links = extractLinksFromMessage("");
      expect(links).toEqual([]);
    });

    it("returns empty array for whitespace only", () => {
      const links = extractLinksFromMessage("   \n\t   ");
      expect(links).toEqual([]);
    });

    it("returns empty array when no URLs present", () => {
      const links = extractLinksFromMessage("This is just plain text");
      expect(links).toEqual([]);
    });

    it("handles multiple URLs in complex text", () => {
      const links = extractLinksFromMessage(
        "First https://one.com then https://two.com and https://three.com!"
      );
      expect(links).toHaveLength(3);
    });
  });
});
