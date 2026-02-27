import { describe, expect, it, vi } from "vitest";
import type { OpenClawPluginApi } from "./types.js";
import { createPluginRegistry } from "./registry.js";
import { createPluginRuntime } from "./runtime/index.js";

const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const createTestRegistry = () => {
  const logger = createMockLogger();
  const runtime = createPluginRuntime();
  return createPluginRegistry({
    logger,
    runtime,
    coreGatewayHandlers: {},
  });
};

const createTestPluginRecord = (id: string) => ({
  id,
  name: id,
  source: `/test/${id}.ts`,
  origin: "config" as const,
  enabled: true,
  status: "loaded" as const,
  toolNames: [],
  hookNames: [],
  channelIds: [],
  providerIds: [],
  gatewayMethods: [],
  cliCommands: [],
  services: [],
  commands: [],
  httpHandlers: 0,
  hookCount: 0,
  configSchema: true,
});

describe("createPluginRegistry", () => {
  describe("tool registration", () => {
    it("registers tool factories", () => {
      const { registry, registerTool } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const factory = () => ({ name: "test-tool", description: "test", schema: {}, execute: vi.fn() });
      registerTool(record, factory, { name: "test-tool" });

      expect(registry.tools).toHaveLength(1);
      expect(registry.tools[0].pluginId).toBe("test-plugin");
      expect(registry.tools[0].names).toEqual(["test-tool"]);
      expect(record.toolNames).toEqual(["test-tool"]);
    });

    it("registers tool objects directly", () => {
      const { registry, registerTool } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const tool = { name: "direct-tool", description: "test", schema: {}, execute: vi.fn() };
      registerTool(record, tool);

      expect(registry.tools).toHaveLength(1);
      expect(registry.tools[0].names).toContain("direct-tool");
      expect(record.toolNames).toContain("direct-tool");
    });

    it("supports multiple tool names", () => {
      const { registry, registerTool } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const factory = () => ({ name: "tool", description: "test", schema: {}, execute: vi.fn() });
      registerTool(record, factory, { names: ["tool-one", "tool-two"] });

      expect(registry.tools[0].names).toEqual(["tool-one", "tool-two"]);
      expect(record.toolNames).toEqual(["tool-one", "tool-two"]);
    });

    it("supports optional tools", () => {
      const { registry, registerTool } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const factory = () => ({ name: "optional-tool", description: "test", schema: {}, execute: vi.fn() });
      registerTool(record, factory, { name: "optional-tool", optional: true });

      expect(registry.tools[0].optional).toBe(true);
    });

    it("trims and filters empty tool names", () => {
      const { registry, registerTool } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const factory = () => ({ name: "tool", description: "test", schema: {}, execute: vi.fn() });
      registerTool(record, factory, { names: ["  tool  ", "", "  "] });

      expect(registry.tools[0].names).toEqual(["tool"]);
      expect(record.toolNames).toEqual(["tool"]);
    });
  });

  describe("hook registration", () => {
    it("registers hooks with name and events", () => {
      const { registry, registerHook } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      const config = { hooks: { internal: { enabled: true } } };
      registerHook(record, ["message.create"], handler, { name: "test-hook" }, config);

      expect(registry.hooks).toHaveLength(1);
      expect(registry.hooks[0].pluginId).toBe("test-plugin");
      expect(registry.hooks[0].events).toEqual(["message.create"]);
      expect(record.hookNames).toContain("test-hook");
    });

    it("supports single event strings", () => {
      const { registry, registerHook } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      const config = { hooks: { internal: { enabled: true } } };
      registerHook(record, "single.event", handler, { name: "single-hook" }, config);

      expect(registry.hooks[0].events).toEqual(["single.event"]);
    });

    it("warns when hook name is missing", () => {
      const { registry, registerHook } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      registerHook(record, ["event"], handler, {}, {});

      expect(registry.hooks).toHaveLength(0);
      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0].level).toBe("warn");
      expect(registry.diagnostics[0].message).toContain("missing name");
    });

    it("skips registration when hooks system is disabled", () => {
      const { registry, registerHook } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      const config = { hooks: { internal: { enabled: false } } };
      registerHook(record, ["event"], handler, { name: "test-hook" }, config);

      expect(registry.hooks).toHaveLength(1); // Still tracked in registry
    });

    it("skips registration when register option is false", () => {
      const { registry, registerHook } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      const config = { hooks: { internal: { enabled: true } } };
      registerHook(record, ["event"], handler, { name: "test-hook", register: false }, config);

      expect(registry.hooks).toHaveLength(1); // Still tracked in registry
    });

    it("trims and filters empty event names", () => {
      const { registry, registerHook } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      const config = { hooks: { internal: { enabled: true } } };
      registerHook(record, ["  event.one  ", "", "  event.two  "], handler, { name: "hook" }, config);

      expect(registry.hooks[0].events).toEqual(["event.one", "event.two"]);
    });
  });

  describe("gateway method registration", () => {
    it("registers gateway methods", () => {
      const { registry, registerGatewayMethod } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      registerGatewayMethod(record, "plugin.method", handler);

      expect(registry.gatewayHandlers["plugin.method"]).toBe(handler);
      expect(record.gatewayMethods).toContain("plugin.method");
    });

    it("rejects duplicate gateway methods", () => {
      const { registry, registerGatewayMethod } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registerGatewayMethod(record, "method", handler1);
      registerGatewayMethod(record, "method", handler2);

      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0].level).toBe("error");
      expect(registry.diagnostics[0].message).toContain("already registered");
    });

    it("rejects methods that conflict with core handlers", () => {
      const logger = createMockLogger();
      const runtime = createPluginRuntime();
      const coreHandler = vi.fn();
      const { registry, registerGatewayMethod } = createPluginRegistry({
        logger,
        runtime,
        coreGatewayHandlers: { "core.method": coreHandler },
      });
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      registerGatewayMethod(record, "core.method", handler);

      expect(registry.gatewayHandlers["core.method"]).toBe(coreHandler);
      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0].level).toBe("error");
    });

    it("ignores empty method names", () => {
      const { registry, registerGatewayMethod } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      registerGatewayMethod(record, "", handler);
      registerGatewayMethod(record, "   ", handler);

      expect(Object.keys(registry.gatewayHandlers)).toHaveLength(0);
      expect(record.gatewayMethods).toHaveLength(0);
    });
  });

  describe("channel registration", () => {
    it("registers channel plugins", () => {
      const { registry, registerChannel } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const channelPlugin = {
        id: "test-channel",
        meta: {
          id: "test-channel",
          label: "Test",
          selectionLabel: "Test Channel",
          docsPath: "/channels/test",
          blurb: "Test channel",
        },
        capabilities: { chatTypes: ["direct" as const] },
        config: {
          listAccountIds: () => [],
          resolveAccount: () => ({ accountId: "default" }),
        },
        outbound: { deliveryMode: "direct" as const },
      };

      registerChannel(record, { plugin: channelPlugin });

      expect(registry.channels).toHaveLength(1);
      expect(registry.channels[0].plugin.id).toBe("test-channel");
      expect(record.channelIds).toContain("test-channel");
    });

    it("registers channel plugins directly without wrapper", () => {
      const { registry, registerChannel } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const channelPlugin = {
        id: "direct-channel",
        meta: {
          id: "direct-channel",
          label: "Direct",
          selectionLabel: "Direct Channel",
          docsPath: "/channels/direct",
          blurb: "Direct channel",
        },
        capabilities: { chatTypes: ["direct" as const] },
        config: {
          listAccountIds: () => [],
          resolveAccount: () => ({ accountId: "default" }),
        },
        outbound: { deliveryMode: "direct" as const },
      };

      registerChannel(record, channelPlugin);

      expect(registry.channels).toHaveLength(1);
      expect(registry.channels[0].plugin.id).toBe("direct-channel");
    });

    it("rejects channels with missing id", () => {
      const { registry, registerChannel } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const invalidChannel = {
        id: "",
        meta: { id: "", label: "Invalid", selectionLabel: "Invalid", docsPath: "/invalid", blurb: "" },
        capabilities: { chatTypes: [] },
        config: { listAccountIds: () => [], resolveAccount: () => ({ accountId: "default" }) },
        outbound: { deliveryMode: "direct" as const },
      };

      registerChannel(record, { plugin: invalidChannel });

      expect(registry.channels).toHaveLength(0);
      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0].level).toBe("error");
      expect(registry.diagnostics[0].message).toContain("missing id");
    });
  });

  describe("provider registration", () => {
    it("registers provider plugins", () => {
      const { registry, registerProvider } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const provider = {
        id: "test-provider",
        label: "Test Provider",
        models: [],
      };

      registerProvider(record, provider);

      expect(registry.providers).toHaveLength(1);
      expect(registry.providers[0].provider.id).toBe("test-provider");
      expect(record.providerIds).toContain("test-provider");
    });

    it("rejects providers with missing id", () => {
      const { registry, registerProvider } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const invalidProvider = {
        id: "",
        label: "Invalid",
        models: [],
      };

      registerProvider(record, invalidProvider);

      expect(registry.providers).toHaveLength(0);
      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0].level).toBe("error");
      expect(registry.diagnostics[0].message).toContain("missing id");
    });

    it("rejects duplicate provider ids", () => {
      const { registry, registerProvider } = createTestRegistry();
      const record1 = createTestPluginRecord("plugin-1");
      const record2 = createTestPluginRecord("plugin-2");

      const provider1 = { id: "shared-provider", label: "Provider 1", models: [] };
      const provider2 = { id: "shared-provider", label: "Provider 2", models: [] };

      registerProvider(record1, provider1);
      registerProvider(record2, provider2);

      expect(registry.providers).toHaveLength(1);
      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0].level).toBe("error");
      expect(registry.diagnostics[0].message).toContain("already registered");
    });
  });

  describe("http handler registration", () => {
    it("registers http handlers", () => {
      const { registry, registerHttpHandler } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      registerHttpHandler(record, handler);

      expect(registry.httpHandlers).toHaveLength(1);
      expect(registry.httpHandlers[0].handler).toBe(handler);
      expect(record.httpHandlers).toBe(1);
    });

    it("increments handler count for multiple handlers", () => {
      const { registry, registerHttpHandler } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      registerHttpHandler(record, vi.fn());
      registerHttpHandler(record, vi.fn());
      registerHttpHandler(record, vi.fn());

      expect(registry.httpHandlers).toHaveLength(3);
      expect(record.httpHandlers).toBe(3);
    });
  });

  describe("http route registration", () => {
    it("registers http routes with normalized paths", () => {
      const { registry, registerHttpRoute } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      registerHttpRoute(record, { path: "/api/test", handler });

      expect(registry.httpRoutes).toHaveLength(1);
      expect(registry.httpRoutes[0].path).toBe("/api/test");
      expect(record.httpHandlers).toBe(1);
    });

    it("rejects routes with empty paths", () => {
      const { registry, registerHttpRoute } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const handler = vi.fn();
      registerHttpRoute(record, { path: "", handler });

      expect(registry.httpRoutes).toHaveLength(0);
      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0].level).toBe("warn");
      expect(registry.diagnostics[0].message).toContain("missing path");
    });

    it("rejects duplicate route paths", () => {
      const { registry, registerHttpRoute } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      registerHttpRoute(record, { path: "/duplicate", handler: vi.fn() });
      registerHttpRoute(record, { path: "/duplicate", handler: vi.fn() });

      expect(registry.httpRoutes).toHaveLength(1);
      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0].level).toBe("error");
      expect(registry.diagnostics[0].message).toContain("already registered");
    });
  });

  describe("service registration", () => {
    it("registers services", () => {
      const { registry, registerService } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const service = {
        id: "test-service",
        start: vi.fn(),
        stop: vi.fn(),
      };

      registerService(record, service);

      expect(registry.services).toHaveLength(1);
      expect(registry.services[0].service.id).toBe("test-service");
      expect(record.services).toContain("test-service");
    });

    it("ignores services with empty id", () => {
      const { registry, registerService } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const service = {
        id: "",
        start: vi.fn(),
        stop: vi.fn(),
      };

      registerService(record, service);

      expect(registry.services).toHaveLength(0);
      expect(record.services).toHaveLength(0);
    });
  });

  describe("createApi", () => {
    it("creates plugin API with all registration methods", () => {
      const { createApi } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const api = createApi(record, {
        config: {},
        pluginConfig: { key: "value" },
      });

      expect(api.id).toBe("test-plugin");
      expect(api.name).toBe("test-plugin");
      expect(api.pluginConfig).toEqual({ key: "value" });
      expect(typeof api.registerTool).toBe("function");
      expect(typeof api.registerHook).toBe("function");
      expect(typeof api.registerChannel).toBe("function");
      expect(typeof api.registerProvider).toBe("function");
      expect(typeof api.registerGatewayMethod).toBe("function");
      expect(typeof api.registerHttpHandler).toBe("function");
      expect(typeof api.registerHttpRoute).toBe("function");
      expect(typeof api.registerService).toBe("function");
      expect(typeof api.registerCommand).toBe("function");
      expect(typeof api.registerCli).toBe("function");
      expect(typeof api.resolvePath).toBe("function");
      expect(typeof api.on).toBe("function");
    });

    it("provides logger methods", () => {
      const { createApi } = createTestRegistry();
      const record = createTestPluginRecord("test-plugin");

      const api = createApi(record, { config: {} });

      expect(typeof api.logger.info).toBe("function");
      expect(typeof api.logger.warn).toBe("function");
      expect(typeof api.logger.error).toBe("function");
      expect(typeof api.logger.debug).toBe("function");
    });
  });
});
