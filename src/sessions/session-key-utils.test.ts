import { describe, expect, it } from "vitest";
import {
  isAcpSessionKey,
  isSubagentSessionKey,
  parseAgentSessionKey,
  resolveThreadParentSessionKey,
} from "./session-key-utils.js";

/**
 * Tests for session key parsing and validation utilities
 *
 * Session keys follow patterns like:
 * - agent:<agentId>:<rest>
 * - subagent:<rest>
 * - acp:<rest>
 * - <channel>:<chatType>:<id>
 * - <channel>:<chatType>:<id>:thread:<threadId>
 */

describe("parseAgentSessionKey", () => {
  describe("valid agent session keys", () => {
    it("parses basic agent session key", () => {
      const result = parseAgentSessionKey("agent:main:discord:group:123");

      expect(result).toEqual({
        agentId: "main",
        rest: "discord:group:123",
      });
    });

    it("parses agent session key with subagent", () => {
      const result = parseAgentSessionKey("agent:main:subagent:worker");

      expect(result).toEqual({
        agentId: "main",
        rest: "subagent:worker",
      });
    });

    it("parses agent session key with acp", () => {
      const result = parseAgentSessionKey("agent:main:acp:session123");

      expect(result).toEqual({
        agentId: "main",
        rest: "acp:session123",
      });
    });

    it("preserves multiple colons in rest", () => {
      const result = parseAgentSessionKey("agent:main:slack:channel:proj:dev");

      expect(result).toEqual({
        agentId: "main",
        rest: "slack:channel:proj:dev",
      });
    });

    it("trims whitespace from agent ID", () => {
      const result = parseAgentSessionKey("agent: main :discord:group:123");

      expect(result).toEqual({
        agentId: "main",
        rest: "discord:group:123",
      });
    });
  });

  describe("invalid agent session keys", () => {
    it("returns null for empty string", () => {
      expect(parseAgentSessionKey("")).toBeNull();
    });

    it("returns null for whitespace only", () => {
      expect(parseAgentSessionKey("   \n\t  ")).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(parseAgentSessionKey(undefined)).toBeNull();
    });

    it("returns null for null", () => {
      expect(parseAgentSessionKey(null)).toBeNull();
    });

    it("returns null when missing agent prefix", () => {
      expect(parseAgentSessionKey("main:discord:group:123")).toBeNull();
    });

    it("returns null when wrong prefix", () => {
      expect(parseAgentSessionKey("user:main:discord:group:123")).toBeNull();
    });

    it("returns null when only two parts", () => {
      expect(parseAgentSessionKey("agent:main")).toBeNull();
    });

    it("returns null when agentId is empty", () => {
      expect(parseAgentSessionKey("agent::discord:group:123")).toBeNull();
    });

    it("returns null when rest is empty", () => {
      expect(parseAgentSessionKey("agent:main:")).toBeNull();
    });

    it("returns null when only agent prefix", () => {
      expect(parseAgentSessionKey("agent:")).toBeNull();
    });
  });
});

describe("isSubagentSessionKey", () => {
  describe("direct subagent keys", () => {
    it("identifies subagent key with lowercase prefix", () => {
      expect(isSubagentSessionKey("subagent:worker:123")).toBe(true);
    });

    it("identifies subagent key with uppercase prefix", () => {
      expect(isSubagentSessionKey("SUBAGENT:worker:123")).toBe(true);
    });

    it("identifies subagent key with mixed case", () => {
      expect(isSubagentSessionKey("SubAgent:worker:123")).toBe(true);
    });

    it("identifies simple subagent key", () => {
      expect(isSubagentSessionKey("subagent:worker")).toBe(true);
    });
  });

  describe("agent with subagent rest", () => {
    it("identifies agent session with subagent rest", () => {
      expect(isSubagentSessionKey("agent:main:subagent:worker")).toBe(true);
    });

    it("identifies agent session with uppercase subagent rest", () => {
      expect(isSubagentSessionKey("agent:main:SUBAGENT:worker")).toBe(true);
    });

    it("handles complex subagent path", () => {
      expect(isSubagentSessionKey("agent:main:subagent:worker:task:123")).toBe(true);
    });
  });

  describe("non-subagent keys", () => {
    it("returns false for empty string", () => {
      expect(isSubagentSessionKey("")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isSubagentSessionKey(undefined)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isSubagentSessionKey(null)).toBe(false);
    });

    it("returns false for regular session key", () => {
      expect(isSubagentSessionKey("discord:group:123")).toBe(false);
    });

    it("returns false for agent key without subagent", () => {
      expect(isSubagentSessionKey("agent:main:discord:group:123")).toBe(false);
    });

    it("returns false for acp session key", () => {
      expect(isSubagentSessionKey("acp:session:123")).toBe(false);
    });

    it("returns false for whitespace", () => {
      expect(isSubagentSessionKey("   ")).toBe(false);
    });

    it("returns false when subagent is in middle but not at rest start", () => {
      expect(isSubagentSessionKey("agent:main:discord:subagent:worker")).toBe(false);
    });
  });
});

describe("isAcpSessionKey", () => {
  describe("direct acp keys", () => {
    it("identifies acp key with lowercase prefix", () => {
      expect(isAcpSessionKey("acp:session:123")).toBe(true);
    });

    it("identifies acp key with uppercase prefix", () => {
      expect(isAcpSessionKey("ACP:session:123")).toBe(true);
    });

    it("identifies acp key with mixed case", () => {
      expect(isAcpSessionKey("Acp:session:123")).toBe(true);
    });

    it("identifies simple acp key", () => {
      expect(isAcpSessionKey("acp:session")).toBe(true);
    });
  });

  describe("agent with acp rest", () => {
    it("identifies agent session with acp rest", () => {
      expect(isAcpSessionKey("agent:main:acp:session:123")).toBe(true);
    });

    it("identifies agent session with uppercase acp rest", () => {
      expect(isAcpSessionKey("agent:main:ACP:session:123")).toBe(true);
    });

    it("handles complex acp path", () => {
      expect(isAcpSessionKey("agent:main:acp:session:task:456")).toBe(true);
    });
  });

  describe("non-acp keys", () => {
    it("returns false for empty string", () => {
      expect(isAcpSessionKey("")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isAcpSessionKey(undefined)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isAcpSessionKey(null)).toBe(false);
    });

    it("returns false for regular session key", () => {
      expect(isAcpSessionKey("discord:group:123")).toBe(false);
    });

    it("returns false for agent key without acp", () => {
      expect(isAcpSessionKey("agent:main:discord:group:123")).toBe(false);
    });

    it("returns false for subagent session key", () => {
      expect(isAcpSessionKey("subagent:worker:123")).toBe(false);
    });

    it("returns false for whitespace", () => {
      expect(isAcpSessionKey("   ")).toBe(false);
    });

    it("returns false when acp is in middle but not at rest start", () => {
      expect(isAcpSessionKey("agent:main:discord:acp:session")).toBe(false);
    });
  });
});

describe("resolveThreadParentSessionKey", () => {
  describe("thread markers", () => {
    it("extracts parent from :thread: marker", () => {
      const parent = resolveThreadParentSessionKey("discord:group:dev:thread:123");

      expect(parent).toBe("discord:group:dev");
    });

    it("extracts parent from :topic: marker", () => {
      const parent = resolveThreadParentSessionKey("slack:channel:general:topic:456");

      expect(parent).toBe("slack:channel:general");
    });

    it("uses last occurrence of thread marker", () => {
      const parent = resolveThreadParentSessionKey(
        "discord:group:dev:thread:1:thread:2"
      );

      expect(parent).toBe("discord:group:dev:thread:1");
    });

    it("handles uppercase thread marker", () => {
      const parent = resolveThreadParentSessionKey("discord:group:dev:THREAD:123");

      expect(parent).toBe("discord:group:dev");
    });

    it("handles uppercase topic marker", () => {
      const parent = resolveThreadParentSessionKey("slack:channel:general:TOPIC:456");

      expect(parent).toBe("slack:channel:general");
    });

    it("handles mixed case markers", () => {
      const parent = resolveThreadParentSessionKey("discord:group:dev:Thread:123");

      expect(parent).toBe("discord:group:dev");
    });
  });

  describe("choosing last marker", () => {
    it("prefers :topic: when it's last", () => {
      const parent = resolveThreadParentSessionKey(
        "base:thread:1:topic:2"
      );

      expect(parent).toBe("base:thread:1");
    });

    it("prefers :thread: when it's last", () => {
      const parent = resolveThreadParentSessionKey(
        "base:topic:1:thread:2"
      );

      expect(parent).toBe("base:topic:1");
    });

    it("handles multiple thread markers", () => {
      const parent = resolveThreadParentSessionKey(
        "a:thread:b:thread:c:thread:d"
      );

      expect(parent).toBe("a:thread:b:thread:c");
    });
  });

  describe("no thread markers", () => {
    it("returns null when no thread marker present", () => {
      expect(resolveThreadParentSessionKey("discord:group:dev")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(resolveThreadParentSessionKey("")).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(resolveThreadParentSessionKey(undefined)).toBeNull();
    });

    it("returns null for null", () => {
      expect(resolveThreadParentSessionKey(null)).toBeNull();
    });

    it("returns null for whitespace", () => {
      expect(resolveThreadParentSessionKey("   \n\t  ")).toBeNull();
    });

    it("returns null when marker at start", () => {
      expect(resolveThreadParentSessionKey(":thread:123")).toBeNull();
    });

    it("returns null when parent would be empty", () => {
      expect(resolveThreadParentSessionKey("thread:123")).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles thread marker with complex parent", () => {
      const parent = resolveThreadParentSessionKey(
        "agent:main:discord:group:dev:thread:123"
      );

      expect(parent).toBe("agent:main:discord:group:dev");
    });

    it("handles topic marker with complex parent", () => {
      const parent = resolveThreadParentSessionKey(
        "agent:main:slack:channel:general:topic:456"
      );

      expect(parent).toBe("agent:main:slack:channel:general");
    });

    it("trims result", () => {
      const parent = resolveThreadParentSessionKey(" base:thread:123 ");

      expect(parent).toBe("base");
    });

    it("returns null when trimmed parent is empty", () => {
      const parent = resolveThreadParentSessionKey("  :thread:123");

      expect(parent).toBeNull();
    });

    it("handles subagent with thread", () => {
      const parent = resolveThreadParentSessionKey(
        "subagent:worker:thread:123"
      );

      expect(parent).toBe("subagent:worker");
    });

    it("handles acp with thread", () => {
      const parent = resolveThreadParentSessionKey(
        "acp:session:topic:456"
      );

      expect(parent).toBe("acp:session");
    });
  });
});
