import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import { deliverOutboundPayloads, type OutboundSendDeps } from "../infra/outbound/deliver.js";

const createMockDeps = () => ({
  sendDiscord: vi.fn(async (_to, _text) => ({ messageId: "discord-msg-1" })),
  sendSlack: vi.fn(async (_to, _text) => ({ messageId: "slack-msg-1" })),
  sendTelegram: vi.fn(async (_to, _text) => ({ messageId: "telegram-msg-1" })),
  sendWhatsApp: vi.fn(async (_to, _text) => ({ messageId: "whatsapp-msg-1" })),
  sendSignal: vi.fn(async (_to, _text) => ({ messageId: "signal-msg-1" })),
  sendIMessage: vi.fn(async (_to, _text) => ({ messageId: "imessage-msg-1" })),
});

const createTestConfig = (): OpenClawConfig => ({});

describe("delivery fallback and error handling", () => {
  beforeEach(() => {
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
      ]),
    );
  });

  describe("error handling without bestEffort", () => {
    it("throws error when send function fails", async () => {
      const deps = createMockDeps();
      deps.sendDiscord = vi.fn().mockRejectedValue(new Error("Network error"));
      const cfg = createTestConfig();

      await expect(
        deliverOutboundPayloads({
          cfg,
          channel: "discord",
          to: "user123",
          payloads: [{ text: "Hello" }],
          deps,
        }),
      ).rejects.toThrow("Network error");
    });

    it("throws error when channel adapter is not configured", async () => {
      const deps = createMockDeps();
      const cfg = createTestConfig();

      await expect(
        deliverOutboundPayloads({
          cfg,
          channel: "nonexistent" as "discord",
          to: "user123",
          payloads: [{ text: "Hello" }],
          deps,
        }),
      ).rejects.toThrow(/Outbound not configured/);
    });

    it("stops delivery on first error", async () => {
      const deps = createMockDeps();
      deps.sendDiscord = vi
        .fn()
        .mockResolvedValueOnce({ messageId: "msg-1" })
        .mockRejectedValueOnce(new Error("Failed on second message"))
        .mockResolvedValueOnce({ messageId: "msg-3" });
      const cfg = createTestConfig();

      await expect(
        deliverOutboundPayloads({
          cfg,
          channel: "discord",
          to: "user123",
          payloads: [{ text: "Message 1" }, { text: "Message 2" }, { text: "Message 3" }],
          deps,
        }),
      ).rejects.toThrow("Failed on second message");

      expect(deps.sendDiscord).toHaveBeenCalledTimes(2);
    });
  });

  describe("best effort delivery mode", () => {
    it("continues delivery after error when bestEffort is true", async () => {
      const deps = createMockDeps();
      deps.sendDiscord = vi
        .fn()
        .mockResolvedValueOnce({ messageId: "msg-1" })
        .mockRejectedValueOnce(new Error("Failed on second message"))
        .mockResolvedValueOnce({ messageId: "msg-3" });
      const cfg = createTestConfig();

      const results = await deliverOutboundPayloads({
        cfg,
        channel: "discord",
        to: "user123",
        payloads: [{ text: "Message 1" }, { text: "Message 2" }, { text: "Message 3" }],
        deps,
        bestEffort: true,
      });

      expect(deps.sendDiscord).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(2); // Only successful deliveries
      expect(results[0].messageId).toBe("msg-1");
      expect(results[1].messageId).toBe("msg-3");
    });

    it("calls onError callback for failed payloads in bestEffort mode", async () => {
      const deps = createMockDeps();
      deps.sendDiscord = vi
        .fn()
        .mockResolvedValueOnce({ messageId: "msg-1" })
        .mockRejectedValueOnce(new Error("Failed"))
        .mockResolvedValueOnce({ messageId: "msg-3" });
      const cfg = createTestConfig();
      const onError = vi.fn();

      await deliverOutboundPayloads({
        cfg,
        channel: "discord",
        to: "user123",
        payloads: [{ text: "Message 1" }, { text: "Message 2" }, { text: "Message 3" }],
        deps,
        bestEffort: true,
        onError,
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Failed" }),
        expect.objectContaining({ text: "Message 2" }),
      );
    });

    it("delivers all payloads in bestEffort mode when no errors occur", async () => {
      const deps = createMockDeps();
      deps.sendDiscord = vi
        .fn()
        .mockResolvedValueOnce({ messageId: "msg-1" })
        .mockResolvedValueOnce({ messageId: "msg-2" })
        .mockResolvedValueOnce({ messageId: "msg-3" });
      const cfg = createTestConfig();

      const results = await deliverOutboundPayloads({
        cfg,
        channel: "discord",
        to: "user123",
        payloads: [{ text: "Message 1" }, { text: "Message 2" }, { text: "Message 3" }],
        deps,
        bestEffort: true,
      });

      expect(results).toHaveLength(3);
      expect(results[0].messageId).toBe("msg-1");
      expect(results[1].messageId).toBe("msg-2");
      expect(results[2].messageId).toBe("msg-3");
    });
  });

  describe("abort signal handling", () => {
    it("throws error when abortSignal is already aborted", async () => {
      const deps = createMockDeps();
      const cfg = createTestConfig();
      const controller = new AbortController();
      controller.abort();

      await expect(
        deliverOutboundPayloads({
          cfg,
          channel: "discord",
          to: "user123",
          payloads: [{ text: "Hello" }],
          deps,
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow("Outbound delivery aborted");
    });

    it("stops delivery when aborted mid-flight", async () => {
      const deps = createMockDeps();
      const cfg = createTestConfig();
      const controller = new AbortController();

      deps.sendDiscord = vi.fn().mockImplementation(async () => {
        // Abort after first message
        controller.abort();
        return { messageId: "msg-1" };
      });

      await expect(
        deliverOutboundPayloads({
          cfg,
          channel: "discord",
          to: "user123",
          payloads: [{ text: "Message 1" }, { text: "Message 2" }],
          deps,
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow("Outbound delivery aborted");

      expect(deps.sendDiscord).toHaveBeenCalledTimes(1);
    });
  });

  describe("onPayload callback", () => {
    it("calls onPayload for each payload before delivery", async () => {
      const deps = createMockDeps();
      const cfg = createTestConfig();
      const onPayload = vi.fn();

      await deliverOutboundPayloads({
        cfg,
        channel: "discord",
        to: "user123",
        payloads: [{ text: "Message 1" }, { text: "Message 2" }],
        deps,
        onPayload,
      });

      expect(onPayload).toHaveBeenCalledTimes(2);
      expect(onPayload).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: "Message 1" }));
      expect(onPayload).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: "Message 2" }));
    });

    it("includes media urls in onPayload callback", async () => {
      const deps = createMockDeps();
      const cfg = createTestConfig();
      const onPayload = vi.fn();

      await deliverOutboundPayloads({
        cfg,
        channel: "discord",
        to: "user123",
        payloads: [{ text: "Check this", mediaUrl: "https://example.com/image.png" }],
        deps,
        onPayload,
      });

      expect(onPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Check this",
          mediaUrls: ["https://example.com/image.png"],
        }),
      );
    });
  });

  describe("media delivery fallback", () => {
    it("sends text without media when mediaUrls array is empty", async () => {
      const deps = createMockDeps();
      const cfg = createTestConfig();

      await deliverOutboundPayloads({
        cfg,
        channel: "discord",
        to: "user123",
        payloads: [{ text: "Text only", mediaUrls: [] }],
        deps,
      });

      expect(deps.sendDiscord).toHaveBeenCalledTimes(1);
      expect(deps.sendDiscord).toHaveBeenCalledWith("user123", "Text only", expect.any(Object));
    });

    it("sends multiple media items from mediaUrls array", async () => {
      const deps = createMockDeps();
      deps.sendDiscord = vi.fn(async (_to, _text, opts) => ({
        messageId: `msg-${opts?.mediaUrl}`,
      }));
      const cfg = createTestConfig();

      const results = await deliverOutboundPayloads({
        cfg,
        channel: "discord",
        to: "user123",
        payloads: [
          {
            text: "Multiple images",
            mediaUrls: ["https://example.com/img1.png", "https://example.com/img2.png"],
          },
        ],
        deps,
      });

      expect(deps.sendDiscord).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
    });

    it("includes caption only on first media item", async () => {
      const deps = createMockDeps();
      const cfg = createTestConfig();

      await deliverOutboundPayloads({
        cfg,
        channel: "discord",
        to: "user123",
        payloads: [
          {
            text: "Caption text",
            mediaUrls: ["https://example.com/img1.png", "https://example.com/img2.png"],
          },
        ],
        deps,
      });

      expect(deps.sendDiscord).toHaveBeenNthCalledWith(1, "user123", "Caption text", expect.any(Object));
      expect(deps.sendDiscord).toHaveBeenNthCalledWith(2, "user123", "", expect.any(Object));
    });
  });

  describe("channel-specific error messages", () => {
    it("provides clear error for unconfigured outbound adapter", async () => {
      const deps = createMockDeps();
      const cfg = createTestConfig();

      // Create a registry with a plugin that has no outbound adapter
      setActivePluginRegistry(
        createTestRegistry([
          {
            pluginId: "broken",
            plugin: {
              id: "broken",
              meta: {
                id: "broken",
                label: "Broken",
                selectionLabel: "Broken",
                docsPath: "/channels/broken",
                blurb: "Broken channel",
              },
              capabilities: { chatTypes: ["direct"] },
              config: {
                listAccountIds: () => ["default"],
                resolveAccount: () => ({ accountId: "default" }),
              },
              // No outbound adapter
            },
            source: "test",
          },
        ]),
      );

      await expect(
        deliverOutboundPayloads({
          cfg,
          channel: "broken" as "discord",
          to: "user123",
          payloads: [{ text: "Hello" }],
          deps,
        }),
      ).rejects.toThrow(/Outbound not configured for channel: broken/);
    });
  });

  describe("retry logic", () => {
    it("does not retry failed deliveries automatically", async () => {
      const deps = createMockDeps();
      deps.sendDiscord = vi.fn().mockRejectedValue(new Error("Network timeout"));
      const cfg = createTestConfig();

      await expect(
        deliverOutboundPayloads({
          cfg,
          channel: "discord",
          to: "user123",
          payloads: [{ text: "Hello" }],
          deps,
        }),
      ).rejects.toThrow("Network timeout");

      expect(deps.sendDiscord).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe("empty payload handling", () => {
    it("handles empty payloads array", async () => {
      const deps = createMockDeps();
      const cfg = createTestConfig();

      const results = await deliverOutboundPayloads({
        cfg,
        channel: "discord",
        to: "user123",
        payloads: [],
        deps,
      });

      expect(results).toEqual([]);
      expect(deps.sendDiscord).not.toHaveBeenCalled();
    });

    it("skips payloads with empty text and no media", async () => {
      const deps = createMockDeps();
      const cfg = createTestConfig();

      const results = await deliverOutboundPayloads({
        cfg,
        channel: "discord",
        to: "user123",
        payloads: [{ text: "" }],
        deps,
      });

      expect(results).toHaveLength(1);
      expect(deps.sendDiscord).toHaveBeenCalledWith("user123", "", expect.any(Object));
    });
  });
});
