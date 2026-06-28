import { beforeEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { ChatChannelId } from "./registry.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import { getChannelDock } from "./dock.js";

const createTestPlugin = (params: {
  id: ChatChannelId;
  resolveAllowFrom?: (params: { cfg: OpenClawConfig; accountId?: string | null }) => Array<string | number> | undefined;
  formatAllowFrom?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    allowFrom: Array<string | number>;
  }) => string[];
}) => ({
  id: params.id,
  meta: {
    id: params.id,
    label: String(params.id),
    selectionLabel: String(params.id),
    docsPath: `/channels/${params.id}`,
    blurb: "test channel",
  },
  capabilities: { chatTypes: ["direct" as const] },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: () => ({ accountId: "default" }),
    resolveAllowFrom: params.resolveAllowFrom,
    formatAllowFrom: params.formatAllowFrom,
  },
  outbound: {
    deliveryMode: "direct" as const,
    sendText: async () => ({ channel: params.id, messageId: "test-msg-1" }),
    sendMedia: async () => ({ channel: params.id, messageId: "test-msg-2" }),
  },
});

describe("allowlist enforcement", () => {
  describe("resolveAllowFrom", () => {
    it("returns allowlist from telegram config", () => {
      const cfg: OpenClawConfig = {
        channels: {
          telegram: {
            accounts: {
              default: {
                config: {
                  allowFrom: ["user123", "user456"],
                },
              },
            },
          },
        },
      };

      const dock = getChannelDock("telegram");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toEqual(["user123", "user456"]);
    });

    it("returns allowlist from whatsapp config", () => {
      const cfg: OpenClawConfig = {
        channels: {
          whatsapp: {
            accounts: {
              default: {
                allowFrom: ["+15551234567", "+15559876543"],
              },
            },
          },
        },
      };

      const dock = getChannelDock("whatsapp");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toEqual(["+15551234567", "+15559876543"]);
    });

    it("returns allowlist from discord dm config", () => {
      const cfg: OpenClawConfig = {
        channels: {
          discord: {
            accounts: {
              default: {
                config: {
                  dm: {
                    allowFrom: ["user123", "user456"],
                  },
                },
              },
            },
          },
        },
      };

      const dock = getChannelDock("discord");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toEqual(["user123", "user456"]);
    });

    it("returns allowlist from slack config", () => {
      const cfg: OpenClawConfig = {
        channels: {
          slack: {
            accounts: {
              default: {
                dm: {
                  allowFrom: ["U123", "U456"],
                },
              },
            },
          },
        },
      };

      const dock = getChannelDock("slack");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toEqual(["U123", "U456"]);
    });

    it("returns allowlist from signal config", () => {
      const cfg: OpenClawConfig = {
        channels: {
          signal: {
            accounts: {
              default: {
                config: {
                  allowFrom: ["+15551234567", "+15559876543"],
                },
              },
            },
          },
        },
      };

      const dock = getChannelDock("signal");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toEqual(["+15551234567", "+15559876543"]);
    });

    it("returns allowlist from imessage config", () => {
      const cfg: OpenClawConfig = {
        channels: {
          imessage: {
            accounts: {
              default: {
                config: {
                  allowFrom: ["+15551234567", "user@example.com"],
                },
              },
            },
          },
        },
      };

      const dock = getChannelDock("imessage");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toEqual(["+15551234567", "user@example.com"]);
    });

    it("returns undefined when allowlist is not configured", () => {
      const cfg: OpenClawConfig = {
        channels: {
          telegram: {
            accounts: {
              default: {},
            },
          },
        },
      };

      const dock = getChannelDock("telegram");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toBeUndefined();
    });

    it("returns empty array when allowFrom is empty", () => {
      const cfg: OpenClawConfig = {
        channels: {
          telegram: {
            accounts: {
              default: {
                config: {
                  allowFrom: [],
                },
              },
            },
          },
        },
      };

      const dock = getChannelDock("telegram");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toEqual([]);
    });
  });

  describe("formatAllowFrom", () => {
    it("formats telegram allowFrom by lowercasing and stripping prefixes", () => {
      const cfg: OpenClawConfig = {};
      const dock = getChannelDock("telegram");

      const formatted = dock?.config?.formatAllowFrom?.({
        cfg,
        accountId: "default",
        allowFrom: ["TG:User123", "telegram:User456", "User789"],
      });

      expect(formatted).toEqual(["user123", "user456", "user789"]);
    });

    it("formats whatsapp allowFrom by normalizing phone numbers", () => {
      const cfg: OpenClawConfig = {};
      const dock = getChannelDock("whatsapp");

      const formatted = dock?.config?.formatAllowFrom?.({
        cfg,
        accountId: "default",
        allowFrom: ["whatsapp:(555) 123-4567", "(555) 987-6543", "+15551112222"],
      });

      expect(formatted).toEqual(["+5551234567", "+5559876543", "+15551112222"]);
    });

    it("preserves whatsapp wildcard entries", () => {
      const cfg: OpenClawConfig = {};
      const dock = getChannelDock("whatsapp");

      const formatted = dock?.config?.formatAllowFrom?.({
        cfg,
        accountId: "default",
        allowFrom: ["*"],
      });

      expect(formatted).toEqual(["*"]);
    });

    it("formats discord allowFrom by lowercasing", () => {
      const cfg: OpenClawConfig = {};
      const dock = getChannelDock("discord");

      const formatted = dock?.config?.formatAllowFrom?.({
        cfg,
        accountId: "default",
        allowFrom: ["User123", "USER456"],
      });

      expect(formatted).toEqual(["user123", "user456"]);
    });

    it("formats slack allowFrom by lowercasing", () => {
      const cfg: OpenClawConfig = {};
      const dock = getChannelDock("slack");

      const formatted = dock?.config?.formatAllowFrom?.({
        cfg,
        accountId: "default",
        allowFrom: ["U123ABC", "U456DEF"],
      });

      expect(formatted).toEqual(["u123abc", "u456def"]);
    });

    it("formats signal allowFrom by normalizing phone numbers", () => {
      const cfg: OpenClawConfig = {};
      const dock = getChannelDock("signal");

      const formatted = dock?.config?.formatAllowFrom?.({
        cfg,
        accountId: "default",
        allowFrom: ["signal:(555) 123-4567", "+15559876543"],
      });

      expect(formatted).toEqual(["+5551234567", "+15559876543"]);
    });

    it("preserves signal wildcard entries", () => {
      const cfg: OpenClawConfig = {};
      const dock = getChannelDock("signal");

      const formatted = dock?.config?.formatAllowFrom?.({
        cfg,
        accountId: "default",
        allowFrom: ["*"],
      });

      expect(formatted).toEqual(["*"]);
    });

    it("formats imessage allowFrom by trimming", () => {
      const cfg: OpenClawConfig = {};
      const dock = getChannelDock("imessage");

      const formatted = dock?.config?.formatAllowFrom?.({
        cfg,
        accountId: "default",
        allowFrom: ["  +15551234567  ", "  user@example.com  "],
      });

      expect(formatted).toEqual(["+15551234567", "user@example.com"]);
    });

    it("filters empty entries from allowFrom", () => {
      const cfg: OpenClawConfig = {};
      const dock = getChannelDock("telegram");

      const formatted = dock?.config?.formatAllowFrom?.({
        cfg,
        accountId: "default",
        allowFrom: ["user123", "", "  ", "user456"],
      });

      expect(formatted).toEqual(["user123", "user456"]);
    });
  });

  describe("allowlist matching scenarios", () => {
    it("matches exact user id", () => {
      const cfg: OpenClawConfig = {
        channels: {
          discord: {
            accounts: {
              default: {
                config: {
                  dm: {
                    allowFrom: ["user123", "user456"],
                  },
                },
              },
            },
          },
        },
      };

      const dock = getChannelDock("discord");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });
      const formatted = dock?.config?.formatAllowFrom?.({ cfg, accountId: "default", allowFrom: allowFrom ?? [] });

      expect(formatted).toContain("user123");
      expect(formatted).toContain("user456");
    });

    it("handles wildcard allowlist", () => {
      const cfg: OpenClawConfig = {
        channels: {
          whatsapp: {
            accounts: {
              default: {
                allowFrom: ["*"],
              },
            },
          },
        },
      };

      const dock = getChannelDock("whatsapp");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toEqual(["*"]);
    });

    it("handles empty allowlist", () => {
      const cfg: OpenClawConfig = {
        channels: {
          telegram: {
            accounts: {
              default: {
                config: {
                  allowFrom: [],
                },
              },
            },
          },
        },
      };

      const dock = getChannelDock("telegram");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toEqual([]);
    });

    it("handles missing allowlist configuration", () => {
      const cfg: OpenClawConfig = {};

      const dock = getChannelDock("telegram");
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toBeUndefined();
    });
  });

  describe("custom plugin allowlist", () => {
    beforeEach(() => {
      setActivePluginRegistry(
        createTestRegistry([
          {
            pluginId: "custom",
            plugin: createTestPlugin({
              id: "telegram",
              resolveAllowFrom: ({ cfg, accountId }) => {
                const channels = cfg.channels as Record<string, unknown> | undefined;
                const customCfg = channels?.custom as { allowFrom?: string[] } | undefined;
                return customCfg?.allowFrom;
              },
              formatAllowFrom: ({ allowFrom }) => {
                return allowFrom.map((entry) => String(entry).trim().toUpperCase());
              },
            }),
            source: "test",
            dock: {
              id: "custom" as ChatChannelId,
              capabilities: { chatTypes: ["direct"] },
              config: {
                resolveAllowFrom: ({ cfg }) => {
                  const channels = cfg.channels as Record<string, unknown> | undefined;
                  const customCfg = channels?.custom as { allowFrom?: string[] } | undefined;
                  return customCfg?.allowFrom;
                },
                formatAllowFrom: ({ allowFrom }) => {
                  return allowFrom.map((entry) => String(entry).trim().toUpperCase());
                },
              },
            },
          },
        ]),
      );
    });

    it("uses custom resolveAllowFrom logic", () => {
      const cfg: OpenClawConfig = {
        channels: {
          custom: {
            allowFrom: ["customUser1", "customUser2"],
          },
        },
      };

      const dock = getChannelDock("custom" as ChatChannelId);
      const allowFrom = dock?.config?.resolveAllowFrom?.({ cfg, accountId: "default" });

      expect(allowFrom).toEqual(["customUser1", "customUser2"]);
    });

    it("uses custom formatAllowFrom logic", () => {
      const cfg: OpenClawConfig = {};
      const dock = getChannelDock("custom" as ChatChannelId);

      const formatted = dock?.config?.formatAllowFrom?.({
        cfg,
        accountId: "default",
        allowFrom: ["user1", "user2"],
      });

      expect(formatted).toEqual(["USER1", "USER2"]);
    });
  });
});
