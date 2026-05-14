import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadOpenClawPlugins } from "./loader.js";

const tempDirs: string[] = [];
const prevBundledDir = process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `openclaw-errors-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function writePluginFiles(params: {
  id: string;
  code: string;
  dir?: string;
  filename?: string;
  manifestOverride?: Record<string, unknown>;
}) {
  const dir = params.dir ?? makeTempDir();
  const filename = params.filename ?? `${params.id}.js`;
  const file = path.join(dir, filename);

  fs.writeFileSync(file, params.code, "utf-8");

  const manifest = params.manifestOverride ?? {
    id: params.id,
    configSchema: { type: "object", additionalProperties: false, properties: {} },
  };
  fs.writeFileSync(path.join(dir, "openclaw.plugin.json"), JSON.stringify(manifest, null, 2), "utf-8");

  return { dir, file, id: params.id };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
  if (prevBundledDir === undefined) {
    delete process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;
  } else {
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = prevBundledDir;
  }
});

describe("plugin error handling", () => {
  beforeEach(() => {
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = "/nonexistent/bundled/plugins";
  });

  describe("load failures", () => {
    it("handles syntax errors in plugin code", () => {
      const plugin = writePluginFiles({
        id: "syntax-error",
        code: `module.exports = function(api) { this is invalid syntax }`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["syntax-error"],
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "syntax-error");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toBeDefined();
      expect(registry.diagnostics.some((d) => d.level === "error" && d.pluginId === "syntax-error")).toBe(true);
    });

    it("handles missing file references", () => {
      const dir = makeTempDir();
      const missingFile = path.join(dir, "nonexistent.js");

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [missingFile] },
            allow: ["nonexistent"],
          },
        },
      });

      // Plugin won't appear if file doesn't exist
      const plugin = registry.plugins.find((p) => p.source === missingFile);
      expect(plugin).toBeUndefined();
    });

    it("handles runtime errors during module initialization", () => {
      const plugin = writePluginFiles({
        id: "init-error",
        code: `throw new Error("initialization failed");`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["init-error"],
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "init-error");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toContain("initialization failed");
    });

    it("handles circular dependencies gracefully", () => {
      const dir = makeTempDir();
      const file1 = path.join(dir, "circular-a.js");
      const file2 = path.join(dir, "circular-b.js");

      fs.writeFileSync(file1, `const b = require('./circular-b.js'); module.exports = { a: true };`, "utf-8");
      fs.writeFileSync(file2, `const a = require('./circular-a.js'); module.exports = { b: true };`, "utf-8");
      fs.writeFileSync(
        path.join(dir, "openclaw.plugin.json"),
        JSON.stringify({
          id: "circular-a",
          configSchema: { type: "object", additionalProperties: false, properties: {} },
        }),
        "utf-8"
      );

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [file1] },
            allow: ["circular-a"],
          },
        },
      });

      // Should handle gracefully (might succeed or fail depending on implementation)
      const plugin = registry.plugins.find((p) => p.id === "circular-a");
      expect(plugin).toBeDefined();
    });
  });

  describe("registration failures", () => {
    it("handles errors thrown during register", () => {
      const plugin = writePluginFiles({
        id: "register-error",
        code: `module.exports = function(api) { throw new Error("register failed"); };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["register-error"],
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "register-error");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toContain("register failed");
      expect(registry.diagnostics.some((d) => d.level === "error" && d.message.includes("register failed"))).toBe(true);
    });

    it("warns on async register functions", () => {
      const plugin = writePluginFiles({
        id: "async-register",
        code: `module.exports = async function(api) { /* async not supported */ };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["async-register"],
          },
        },
      });

      const warning = registry.diagnostics.find(
        (d) => d.level === "warn" && d.pluginId === "async-register" && d.message.includes("promise")
      );
      expect(warning).toBeDefined();
    });

    it("handles null pointer errors during registration", () => {
      const plugin = writePluginFiles({
        id: "null-deref",
        code: `module.exports = function(api) { const x = null; x.method(); };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["null-deref"],
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "null-deref");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toBeDefined();
    });

    it("handles type errors during registration", () => {
      const plugin = writePluginFiles({
        id: "type-error",
        code: `module.exports = function(api) { api.notAMethod(); };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["type-error"],
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "type-error");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toBeDefined();
    });
  });

  describe("diagnostics collection", () => {
    it("collects multiple errors from different plugins", () => {
      const plugin1 = writePluginFiles({
        id: "error-1",
        code: `throw new Error("error 1");`,
      });

      const plugin2 = writePluginFiles({
        id: "error-2",
        code: `module.exports = function(api) { throw new Error("error 2"); };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin1.file, plugin2.file] },
            allow: ["error-1", "error-2"],
          },
        },
      });

      const errors = registry.diagnostics.filter((d) => d.level === "error");
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it("associates errors with correct plugin id", () => {
      const plugin = writePluginFiles({
        id: "specific-error",
        code: `module.exports = function(api) { throw new Error("specific"); };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["specific-error"],
          },
        },
      });

      const error = registry.diagnostics.find(
        (d) => d.level === "error" && d.pluginId === "specific-error" && d.message.includes("specific")
      );
      expect(error).toBeDefined();
      expect(error?.source).toBe(plugin.file);
    });

    it("includes source file path in diagnostics", () => {
      const plugin = writePluginFiles({
        id: "source-check",
        code: `throw new Error("test");`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["source-check"],
          },
        },
      });

      const diagnostic = registry.diagnostics.find((d) => d.pluginId === "source-check");
      expect(diagnostic?.source).toBe(plugin.file);
    });
  });

  describe("memory slot errors", () => {
    it("warns when memory slot plugin is not found", () => {
      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            slots: {
              memory: "nonexistent-memory-plugin",
            },
          },
        },
      });

      const warning = registry.diagnostics.find(
        (d) => d.level === "warn" && d.message.includes("memory slot plugin not found")
      );
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("nonexistent-memory-plugin");
    });

    it("warns when memory slot plugin is not marked as memory kind", () => {
      const plugin = writePluginFiles({
        id: "not-memory",
        code: `module.exports = { kind: "channel", register(api) {} };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            slots: {
              memory: "not-memory",
            },
          },
        },
      });

      const warning = registry.diagnostics.find(
        (d) => d.level === "warn" && d.message.includes("memory slot plugin not found")
      );
      expect(warning).toBeDefined();
    });
  });

  describe("duplicate plugin handling", () => {
    it("disables lower-precedence plugins with same id", () => {
      const bundledDir = makeTempDir();
      const bundledFile = path.join(bundledDir, "duplicate.js");
      fs.writeFileSync(bundledFile, `module.exports = function(api) {};`, "utf-8");
      fs.writeFileSync(
        path.join(bundledDir, "openclaw.plugin.json"),
        JSON.stringify({
          id: "duplicate",
          configSchema: { type: "object", additionalProperties: false, properties: {} },
        }),
        "utf-8"
      );
      process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = bundledDir;

      const configPlugin = writePluginFiles({
        id: "duplicate",
        code: `module.exports = function(api) {};`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [configPlugin.file] },
            allow: ["duplicate"],
          },
        },
      });

      const duplicates = registry.plugins.filter((p) => p.id === "duplicate");
      expect(duplicates.length).toBe(2);

      const loaded = duplicates.find((p) => p.status === "loaded");
      const disabled = duplicates.find((p) => p.status === "disabled");

      expect(loaded?.origin).toBe("config");
      expect(disabled?.origin).toBe("bundled");
      expect(disabled?.error).toContain("overridden by config plugin");
    });

    it("tracks all duplicate plugin attempts", () => {
      const bundledDir = makeTempDir();
      const bundledFile = path.join(bundledDir, "triple.js");
      fs.writeFileSync(bundledFile, `module.exports = function(api) {};`, "utf-8");
      fs.writeFileSync(
        path.join(bundledDir, "openclaw.plugin.json"),
        JSON.stringify({
          id: "triple",
          configSchema: { type: "object", additionalProperties: false, properties: {} },
        }),
        "utf-8"
      );
      process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = bundledDir;

      const configPlugin1 = writePluginFiles({
        id: "triple",
        code: `module.exports = function(api) {};`,
      });

      const workspaceDir = makeTempDir();
      const workspaceExt = path.join(workspaceDir, ".openclaw", "extensions");
      fs.mkdirSync(workspaceExt, { recursive: true });
      const workspaceFile = path.join(workspaceExt, "triple.js");
      fs.writeFileSync(workspaceFile, `module.exports = function(api) {};`, "utf-8");
      fs.writeFileSync(
        path.join(workspaceExt, "openclaw.plugin.json"),
        JSON.stringify({
          id: "triple",
          configSchema: { type: "object", additionalProperties: false, properties: {} },
        }),
        "utf-8"
      );

      const registry = loadOpenClawPlugins({
        cache: false,
        workspaceDir,
        config: {
          plugins: {
            load: { paths: [configPlugin1.file] },
            allow: ["triple"],
          },
        },
      });

      const triples = registry.plugins.filter((p) => p.id === "triple");
      expect(triples.length).toBeGreaterThanOrEqual(2);

      const loaded = triples.filter((p) => p.status === "loaded");
      expect(loaded.length).toBe(1);
    });
  });

  describe("config validation errors", () => {
    it("provides detailed schema validation errors", () => {
      const plugin = writePluginFiles({
        id: "schema-detail",
        code: `module.exports = function(api) {};`,
        manifestOverride: {
          id: "schema-detail",
          configSchema: {
            type: "object",
            required: ["apiKey", "secret"],
            properties: {
              apiKey: { type: "string" },
              secret: { type: "string" },
            },
            additionalProperties: false,
          },
        },
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["schema-detail"],
            entries: {
              "schema-detail": {
                config: { apiKey: 123 } as unknown as Record<string, unknown>,
              },
            },
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "schema-detail");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toContain("invalid config");

      const diagnostic = registry.diagnostics.find(
        (d) => d.level === "error" && d.pluginId === "schema-detail"
      );
      expect(diagnostic).toBeDefined();
    });

    it("handles type mismatches in config", () => {
      const plugin = writePluginFiles({
        id: "type-mismatch",
        code: `module.exports = function(api) {};`,
        manifestOverride: {
          id: "type-mismatch",
          configSchema: {
            type: "object",
            properties: {
              count: { type: "number" },
              enabled: { type: "boolean" },
            },
            additionalProperties: false,
          },
        },
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["type-mismatch"],
            entries: {
              "type-mismatch": {
                config: {
                  count: "not-a-number",
                  enabled: "not-a-boolean",
                } as unknown as Record<string, unknown>,
              },
            },
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "type-mismatch");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toContain("invalid config");
    });
  });

  describe("graceful degradation", () => {
    it("continues loading other plugins after one fails", () => {
      const failing = writePluginFiles({
        id: "failing",
        code: `throw new Error("fail");`,
      });

      const working = writePluginFiles({
        id: "working",
        code: `module.exports = function(api) {};`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [failing.file, working.file] },
            allow: ["failing", "working"],
          },
        },
      });

      const failedPlugin = registry.plugins.find((p) => p.id === "failing");
      const workingPlugin = registry.plugins.find((p) => p.id === "working");

      expect(failedPlugin?.status).toBe("error");
      expect(workingPlugin?.status).toBe("loaded");
    });

    it("returns empty registry when all plugins fail", () => {
      const plugin1 = writePluginFiles({
        id: "fail-1",
        code: `throw new Error("error 1");`,
      });

      const plugin2 = writePluginFiles({
        id: "fail-2",
        code: `throw new Error("error 2");`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin1.file, plugin2.file] },
            allow: ["fail-1", "fail-2"],
          },
        },
      });

      expect(registry.plugins.every((p) => p.status === "error")).toBe(true);
      expect(registry.tools).toHaveLength(0);
      expect(registry.channels).toHaveLength(0);
    });
  });
});
