import { describe, expect, it } from "vitest";
import { formatLinkUnderstandingBody } from "./format.js";

/**
 * Tests for formatLinkUnderstandingBody
 *
 * This function formats the message body by appending link understanding outputs.
 * It handles various cases of empty/missing body and outputs.
 */

describe("formatLinkUnderstandingBody", () => {
  describe("with outputs", () => {
    it("appends single output to existing body", () => {
      const result = formatLinkUnderstandingBody({
        body: "Check this out",
        outputs: ["Link preview: Example Site"],
      });

      expect(result).toBe("Check this out\n\nLink preview: Example Site");
    });

    it("appends multiple outputs to existing body", () => {
      const result = formatLinkUnderstandingBody({
        body: "See these links",
        outputs: ["Preview 1: Site A", "Preview 2: Site B", "Preview 3: Site C"],
      });

      expect(result).toBe(
        "See these links\n\nPreview 1: Site A\nPreview 2: Site B\nPreview 3: Site C"
      );
    });

    it("joins outputs with newlines when body is missing", () => {
      const result = formatLinkUnderstandingBody({
        outputs: ["Output 1", "Output 2"],
      });

      expect(result).toBe("Output 1\nOutput 2");
    });

    it("joins outputs with newlines when body is empty string", () => {
      const result = formatLinkUnderstandingBody({
        body: "",
        outputs: ["Output 1", "Output 2"],
      });

      expect(result).toBe("Output 1\nOutput 2");
    });

    it("joins outputs with newlines when body is whitespace only", () => {
      const result = formatLinkUnderstandingBody({
        body: "   \n  \t  ",
        outputs: ["Output 1", "Output 2"],
      });

      expect(result).toBe("Output 1\nOutput 2");
    });

    it("trims body before appending outputs", () => {
      const result = formatLinkUnderstandingBody({
        body: "  Message with spaces  \n\n",
        outputs: ["Output 1"],
      });

      expect(result).toBe("Message with spaces\n\nOutput 1");
    });

    it("filters out empty output strings", () => {
      const result = formatLinkUnderstandingBody({
        body: "Message",
        outputs: ["Output 1", "", "Output 2", "   ", "Output 3"],
      });

      expect(result).toBe("Message\n\nOutput 1\nOutput 2\nOutput 3");
    });

    it("trims whitespace from each output", () => {
      const result = formatLinkUnderstandingBody({
        body: "Message",
        outputs: ["  Output 1  ", "\nOutput 2\n", "\tOutput 3\t"],
      });

      expect(result).toBe("Message\n\nOutput 1\nOutput 2\nOutput 3");
    });
  });

  describe("without outputs", () => {
    it("returns original body when outputs is empty array", () => {
      const result = formatLinkUnderstandingBody({
        body: "Original message",
        outputs: [],
      });

      expect(result).toBe("Original message");
    });

    it("returns empty string when both body and outputs are missing", () => {
      const result = formatLinkUnderstandingBody({
        outputs: [],
      });

      expect(result).toBe("");
    });

    it("returns empty string when body is undefined and outputs are empty", () => {
      const result = formatLinkUnderstandingBody({
        body: undefined,
        outputs: [],
      });

      expect(result).toBe("");
    });

    it("returns original body when outputs contain only whitespace", () => {
      const result = formatLinkUnderstandingBody({
        body: "Message",
        outputs: ["", "   ", "\n\t"],
      });

      expect(result).toBe("Message");
    });

    it("preserves body content when outputs is empty", () => {
      const body = "Multi\nLine\nMessage";
      const result = formatLinkUnderstandingBody({
        body,
        outputs: [],
      });

      expect(result).toBe(body);
    });
  });

  describe("edge cases", () => {
    it("handles single output with body", () => {
      const result = formatLinkUnderstandingBody({
        body: "Body",
        outputs: ["Single output"],
      });

      expect(result).toBe("Body\n\nSingle output");
    });

    it("handles outputs with special characters", () => {
      const result = formatLinkUnderstandingBody({
        body: "Message",
        outputs: ["Output with emoji: 🔗", "Output with <HTML>", "Output with\ttabs"],
      });

      expect(result).toBe(
        "Message\n\nOutput with emoji: 🔗\nOutput with <HTML>\nOutput with\ttabs"
      );
    });

    it("handles outputs with newlines inside", () => {
      const result = formatLinkUnderstandingBody({
        body: "Body",
        outputs: ["Line 1\nLine 2", "Line 3"],
      });

      expect(result).toBe("Body\n\nLine 1\nLine 2\nLine 3");
    });

    it("handles very long outputs", () => {
      const longOutput = "A".repeat(10000);
      const result = formatLinkUnderstandingBody({
        body: "Body",
        outputs: [longOutput],
      });

      expect(result).toBe(`Body\n\n${longOutput}`);
      expect(result.length).toBe(4 + 2 + 10000); // "Body" + "\n\n" + longOutput
    });

    it("handles empty body with undefined", () => {
      const result = formatLinkUnderstandingBody({
        body: undefined,
        outputs: ["Output"],
      });

      expect(result).toBe("Output");
    });

    it("maintains output order", () => {
      const result = formatLinkUnderstandingBody({
        body: "Body",
        outputs: ["First", "Second", "Third", "Fourth"],
      });

      expect(result).toBe("Body\n\nFirst\nSecond\nThird\nFourth");
    });
  });
});
