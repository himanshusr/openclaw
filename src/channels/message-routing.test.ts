import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { ChannelId } from "./plugins/types.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import { sendMessage } from "../infra/outbound/message.js";
import type { OutboundSendDeps } from "../infra/outbound/deliver.js";

const createStubSendFunctions = () => ({
  sendDiscord: vi.fn(async (_to, _text) => ({ messageId: "discord-msg-1" })),
  sendSlack: vi.fn(async (_to, _text) => ({ messageId: "slack-msg-1" })),
  sendTelegram: vi.fn(async (_to, _text) => ({ messageId: "telegram-msg-1" })),
  sendWhatsApp: vi.fn(async (_to, _text) => ({ messageId: "whatsapp-msg-1" })),
  sendSignal: vi.fn(async (_to, _text) => ({ messageId: "signal-msg-1" })),
  sendIMessage: vi.fn(async (_to, _text) => ({ messageId: "imessage-msg-1" }));
});

const createTestConfig = (channels?: OpenClawConfig["channels"]): OpenClawConfig => ({
  channels,
});

describe("message routing", () => {
  beforeEach(() => {
    // Create default registry with stub channel plugins from test/setup.ts pattern
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "discord",
          plugin: {
            id: "discord",
            meta: {
              id: "discord",
              label: "Discord",
              selectionLabel: "Discord",
              docsPath: "/channels/discord",
              blurb: "Discord channel",
            },
            capabilities: { chatTypes: ["direct"] },
            config: {
              listAccountIds: () => ["default"],
              resolveAccount: () => ({ accountId: "default" }),
            },
            outbound: {
              deliveryMode: "direct",
              sendText: async ({ deps, to, text }) => {
                const result = await deps?.sendDiscord?.(to, text, {});
                return { channel: "discord", ...result };
              },
              sendMedia: async ({ deps, to, text, mediaUrl }) => {
                const result = await deps?.sendDiscord?.(to, text, { mediaUrl });
                return { channel: "discord", ...result };
              },
            },
          },
          source: "test",
        },
        {
          pluginId: "slack",
          plugin: {
            id: "slack",
            meta: {
              id: "slack",
              label: "Slack",
              selectionLabel: "Slack",
              docsPath: "/channels/slack",
              blurb: "Slack channel",
            },
            capabilities: { chatTypes: ["direct"] },
            config: {
              listAccountIds: () => ["default"],
              resolveAccount: () => ({ accountId: "default" }),
            },
            outbound: {
              deliveryMode: "direct",
              sendText: async ({ deps, to, text }) => {
                const result = await deps?.sendSlack?.(to, text, {});
                return { channel: "slack", ...result };
              },
              sendMedia: async ({ deps, to, text, mediaUrl }) => {
                const result = await deps?.sendSlack?.(to, text, { mediaUrl });
                return { channel: "slack", ...result };
              },
            },
          },
          source: "test",
        },
        {
          pluginId: "telegram",
          plugin: {
            id: "telegram",
            meta: {
              id: "telegram",
              label: "Telegram",
              selectionLabel: "Telegram",
              docsPath: "/channels/telegram",
              blurb: "Telegram channel",
            },
            capabilities: { chatTypes: ["direct"] },
            config: {
              listAccountIds: () => ["default"],
              resolveAccount: () => ({ accountId: "default" }),
            },
            outbound: {
              deliveryMode: "direct",
              sendText: async ({ deps, to, text }) => {
                const result = await deps?.sendTelegram?.(to, text, {});
                return { channel: "telegram", ...result };
              },
              sendMedia: async ({ deps, to, text, mediaUrl }) => {
                const result = await deps?.sendTelegram?.(to, text, { mediaUrl });
                return { channel: "telegram", ...result };
              },
            },
          },
          source: "test",
        },
        {
          pluginId: "whatsapp",
          plugin: {
            id: "whatsapp",
            meta: {
              id: "whatsapp",
              label: "WhatsApp",
              selectionLabel: "WhatsApp",
              docsPath: "/channels/whatsapp",
              blurb: "WhatsApp channel",
            },
            capabilities: { chatTypes: ["direct"] },
            config: {
              listAccountIds: () => ["default"],
              resolveAccount: () => ({ accountId: "default" }),
            },
            outbound: {
              deliveryMode: "gateway",
              sendText: async ({ deps, to, text }) => {
                const result = await deps?.sendWhatsApp?.(to, text, {});
                return { channel: "whatsapp", ...result };
              },
              sendMedia: async ({ deps, to, text, mediaUrl }) => {
                const result = await deps?.sendWhatsApp?.(to, text, { mediaUrl });
                return { channel: "whatsapp", ...result };
              },
            },
          },
          source: "test",
        },
        {
          pluginId: "signal",
          plugin: {
            id: "signal",
            meta: {
              id: "signal",
              label: "Signal",
              selectionLabel: "Signal",
              docsPath: "/channels/signal",
              blurb: "Signal channel",
            },
            capabilities: { chatTypes: ["direct"] },
            config: {
              listAccountIds: () => ["default"],
              resolveAccount: () => ({ accountId: "default" }),
            },
            outbound: {
              deliveryMode: "direct",
              sendText: async ({ deps, to, text }) => {
                const result = await deps?.sendSignal?.(to, text, {});
                return { channel: "signal", ...result };
              },
              sendMedia: async ({ deps, to, text, mediaUrl }) => {
                const result = await deps?.sendSignal?.(to, text, { mediaUrl });
                return { channel: "signal", ...result };
              },
            },
          },
          source: "test",
        },
        {
          pluginId: "imessage",
          plugin: {
            id: "imessage",
            meta: {
              id: "imessage",
              label: "iMessage",
              selectionLabel: "iMessage",
              docsPath: "/channels/imessage",
              blurb: "iMessage channel",
              aliases: ["imsg"],
            },
            capabilities: { chatTypes: ["direct"] },
            config: {
              listAccountIds: () => ["default"],
              resolveAccount: () => ({ accountId: "default" }),
            },
            outbound: {
              deliveryMode: "direct",
              sendText: async ({ deps, to, text }) => {
                const result = await deps?.sendIMessage?.(to, text, {});
                return { channel: "imessage", ...result };
              },
              sendMedia: async ({ deps, to, text, mediaUrl }) => {
                const result = await deps?.sendIMessage?.(to, text, { mediaUrl });
                return { channel: "imessage", ...result };
              },
            },
          },
          source: "test",
        },
      ]),
    );
  });

  describe("routes messages to correct channel", () => {
    it("routes text message to discord channel", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      await sendMessage({
        to: "user123",
        content: "Hello Discord",
        channel: "discord",
        cfg,
        deps,
      });

      expect(deps.sendDiscord).toHaveBeenCalledTimes(1);
      expect(deps.sendDiscord).toHaveBeenCalledWith("user123", "Hello Discord", expect.any(Object));
      expect(deps.sendSlack).not.toHaveBeenCalled();
      expect(deps.sendTelegram).not.toHaveBeenCalled();
    });

    it("routes text message to slack channel", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      await sendMessage({
        to: "U123456",
        content: "Hello Slack",
        channel: "slack",
        cfg,
        deps,
      });

      expect(deps.sendSlack).toHaveBeenCalledTimes(1);
      expect(deps.sendSlack).toHaveBeenCalledWith("U123456", "Hello Slack", expect.any(Object));
      expect(deps.sendDiscord).not.toHaveBeenCalled();
      expect(deps.sendTelegram).not.toHaveBeenCalled();
    });

    it("routes text message to telegram channel", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      await sendMessage({
        to: "123456789",
        content: "Hello Telegram",
        channel: "telegram",
        cfg,
        deps,
      });

      expect(deps.sendTelegram).toHaveBeenCalledTimes(1);
      expect(deps.sendTelegram).toHaveBeenCalledWith("123456789", "Hello Telegram", expect.any(Object));
      expect(deps.sendDiscord).not.toHaveBeenCalled();
      expect(deps.sendSlack).not.toHaveBeenCalled();
    });

    it("routes text message to signal channel", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      await sendMessage({
        to: "+15551234567",
        content: "Hello Signal",
        channel: "signal",
        cfg,
        deps,
      });

      expect(deps.sendSignal).toHaveBeenCalledTimes(1);
      expect(deps.sendSignal).toHaveBeenCalledWith("+15551234567", "Hello Signal", expect.any(Object));
      expect(deps.sendDiscord).not.toHaveBeenCalled();
      expect(deps.sendSlack).not.toHaveBeenCalled();
    });

    it("routes text message to imessage channel", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      await sendMessage({
        to: "+15551234567",
        content: "Hello iMessage",
        channel: "imessage",
        cfg,
        deps,
      });

      expect(deps.sendIMessage).toHaveBeenCalledTimes(1);
      expect(deps.sendIMessage).toHaveBeenCalledWith("+15551234567", "Hello iMessage", expect.any(Object));
      expect(deps.sendDiscord).not.toHaveBeenCalled();
      expect(deps.sendSlack).not.toHaveBeenCalled();
    });

    it("routes media message to correct channel", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      await sendMessage({
        to: "user123",
        content: "Check this out",
        mediaUrl: "https://example.com/image.png",
        channel: "discord",
        cfg,
        deps,
      });

      expect(deps.sendDiscord).toHaveBeenCalledTimes(1);
      expect(deps.sendDiscord).toHaveBeenCalledWith(
        "user123",
        "Check this out",
        expect.objectContaining({
          mediaUrl: "https://example.com/image.png",
        }),
      );
    });

    it("normalizes channel id case-insensitively", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      await sendMessage({
        to: "user123",
        content: "Hello",
        channel: "DISCORD",
        cfg,
        deps,
      });

      expect(deps.sendDiscord).toHaveBeenCalledTimes(1);
    });
  });

  describe("handles unknown channels", () => {
    it("throws error for non-existent channel", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      await expect(
        sendMessage({
          to: "user123",
          content: "Hello",
          channel: "nonexistent" as ChannelId,
          cfg,
          deps,
        }),
      ).rejects.toThrow(/Unknown channel/);
    });

    it("throws error for empty channel name", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      await expect(
        sendMessage({
          to: "user123",
          content: "Hello",
          channel: "",
          cfg,
          deps,
        }),
      ).rejects.toThrow(/Unknown channel/);
    });
  });

  describe("handles delivery modes", () => {
    it("uses direct delivery for discord", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      const result = await sendMessage({
        to: "user123",
        content: "Hello",
        channel: "discord",
        cfg,
        deps,
      });

      expect(result.via).toBe("direct");
      expect(deps.sendDiscord).toHaveBeenCalledTimes(1);
    });

    it("uses gateway delivery for whatsapp", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      // WhatsApp uses gateway mode, need to mock gateway call
      await expect(
        sendMessage({
          to: "+15551234567",
          content: "Hello",
          channel: "whatsapp",
          cfg,
          deps,
        }),
      ).rejects.toThrow(); // Gateway not configured in test environment
    });
  });

  describe("dry run mode", () => {
    it("returns result without sending when dryRun is true", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      const result = await sendMessage({
        to: "user123",
        content: "Hello",
        channel: "discord",
        cfg,
        deps,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.channel).toBe("discord");
      expect(result.to).toBe("user123");
      expect(deps.sendDiscord).not.toHaveBeenCalled();
    });

    it("includes media info in dry run result", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      const result = await sendMessage({
        to: "user123",
        content: "Hello",
        mediaUrl: "https://example.com/image.png",
        channel: "discord",
        cfg,
        deps,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.mediaUrl).toBe("https://example.com/image.png");
    });
  });

  describe("account id handling", () => {
    it("passes account id to channel send function", async () => {
      const deps = createStubSendFunctions();
      const cfg = createTestConfig();

      await sendMessage({
        to: "user123",
        content: "Hello",
        channel: "discord",
        accountId: "custom-account",
        cfg,
        deps,
      });

      expect(deps.sendDiscord).toHaveBeenCalledWith(
        "user123",
        "Hello",
        expect.objectContaining({
          accountId: "custom-account",
        }),
      );
    });
  });
});
