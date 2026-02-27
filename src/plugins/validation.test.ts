import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadOpenClawPlugins } from "./loader.js";

const tempDirs: string[] = [];
const prevBundledDir = process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `openclaw-validation-${randomUUID()}`);
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

describe("plugin validation", () => {
  beforeEach(() => {
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = "/nonexistent/bundled/plugins";
  });

  describe("export shape validation", () => {
    it("accepts function exports as register", () => {
      const plugin = writePluginFiles({
        id: "func-export",
        code: `module.exports = function(api) { /* register */ };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["func-export"],
          },
        },
      });

      const loaded = registry.plugins.find((p) => p.id === "func-export");
      expect(loaded?.status).toBe("loaded");
    });

    it("accepts default export functions", () => {
      const plugin = writePluginFiles({
        id: "default-func",
        code: `export default function(api) { /* register */ };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["default-func"],
          },
        },
      });

      const loaded = registry.plugins.find((p) => p.id === "default-func");
      expect(loaded?.status).toBe("loaded");
    });

    it("accepts object with register method", () => {
      const plugin = writePluginFiles({
        id: "obj-register",
        code: `module.exports = { register(api) { /* register */ } };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["obj-register"],
          },
        },
      });

      const loaded = registry.plugins.find((p) => p.id === "obj-register");
      expect(loaded?.status).toBe("loaded");
    });

    it("accepts object with activate method as fallback", () => {
      const plugin = writePluginFiles({
        id: "obj-activate",
        code: `module.exports = { activate(api) { /* activate */ } };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["obj-activate"],
          },
        },
      });

      const loaded = registry.plugins.find((p) => p.id === "obj-activate");
      expect(loaded?.status).toBe("loaded");
    });

    it("prefers register over activate when both present", () => {
      const plugin = writePluginFiles({
        id: "both-methods",
        code: `
          let called = null;
          module.exports = {
            register(api) { called = 'register'; },
            activate(api) { called = 'activate'; }
          };
        `,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["both-methods"],
          },
        },
      });

      const loaded = registry.plugins.find((p) => p.id === "both-methods");
      expect(loaded?.status).toBe("loaded");
    });

    it("rejects exports with missing register/activate", () => {
      const plugin = writePluginFiles({
        id: "missing-register",
        code: `module.exports = { id: "missing-register", name: "Missing" };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["missing-register"],
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "missing-register");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toContain("missing register/activate");
    });

    it("rejects null exports", () => {
      const plugin = writePluginFiles({
        id: "null-export",
        code: `module.exports = null;`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["null-export"],
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "null-export");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toContain("missing register/activate");
    });

    it("rejects undefined exports", () => {
      const plugin = writePluginFiles({
        id: "undefined-export",
        code: `module.exports = undefined;`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["undefined-export"],
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "undefined-export");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toContain("missing register/activate");
    });

    it("rejects primitive exports", () => {
      const plugin = writePluginFiles({
        id: "string-export",
        code: `module.exports = "not a plugin";`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["string-export"],
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "string-export");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toContain("missing register/activate");
    });
  });

  describe("config schema validation", () => {
    it("rejects plugins with missing config schema", () => {
      const dir = makeTempDir();
      const file = path.join(dir, "no-schema.js");
      fs.writeFileSync(file, `module.exports = function(api) {};`, "utf-8");
      fs.writeFileSync(
        path.join(dir, "openclaw.plugin.json"),
        JSON.stringify({ id: "no-schema" }, null, 2),
        "utf-8"
      );

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [file] },
            allow: ["no-schema"],
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "no-schema");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toContain("missing config schema");
    });

    it("validates config against JSON schema", () => {
      const plugin = writePluginFiles({
        id: "schema-validation",
        code: `module.exports = function(api) {};`,
        manifestOverride: {
          id: "schema-validation",
          configSchema: {
            type: "object",
            required: ["apiKey"],
            properties: {
              apiKey: { type: "string" },
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
            allow: ["schema-validation"],
            entries: {
              "schema-validation": {
                config: { invalidKey: "value" } as unknown as Record<string, unknown>,
              },
            },
          },
        },
      });

      const failed = registry.plugins.find((p) => p.id === "schema-validation");
      expect(failed?.status).toBe("error");
      expect(failed?.error).toContain("invalid config");
    });

    it("accepts valid config matching schema", () => {
      const plugin = writePluginFiles({
        id: "valid-config",
        code: `module.exports = function(api) {};`,
        manifestOverride: {
          id: "valid-config",
          configSchema: {
            type: "object",
            properties: {
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
            allow: ["valid-config"],
            entries: {
              "valid-config": {
                config: { enabled: true },
              },
            },
          },
        },
      });

      const loaded = registry.plugins.find((p) => p.id === "valid-config");
      expect(loaded?.status).toBe("loaded");
    });

    it("allows empty config when schema permits", () => {
      const plugin = writePluginFiles({
        id: "empty-ok",
        code: `module.exports = function(api) {};`,
        manifestOverride: {
          id: "empty-ok",
          configSchema: {
            type: "object",
            additionalProperties: false,
            properties: {},
          },
        },
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["empty-ok"],
          },
        },
      });

      const loaded = registry.plugins.find((p) => p.id === "empty-ok");
      expect(loaded?.status).toBe("loaded");
    });
  });

  describe("plugin metadata validation", () => {
    it("warns on plugin id mismatch between manifest and export", () => {
      const plugin = writePluginFiles({
        id: "manifest-id",
        code: `module.exports = { id: "export-id", register(api) {} };`,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["manifest-id"],
          },
        },
      });

      const warning = registry.diagnostics.find((d) => d.level === "warn" && d.message.includes("id mismatch"));
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("manifest-id");
      expect(warning?.message).toContain("export-id");
    });

    it("warns on plugin kind mismatch between manifest and export", () => {
      const plugin = writePluginFiles({
        id: "kind-mismatch",
        code: `module.exports = { kind: "memory", register(api) {} };`,
        manifestOverride: {
          id: "kind-mismatch",
          kind: "channel",
          configSchema: { type: "object", additionalProperties: false, properties: {} },
        },
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["kind-mismatch"],
          },
        },
      });

      const warning = registry.diagnostics.find((d) => d.level === "warn" && d.message.includes("kind mismatch"));
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("channel");
      expect(warning?.message).toContain("memory");
    });

    it("uses export metadata when manifest omits it", () => {
      const plugin = writePluginFiles({
        id: "metadata-from-export",
        code: `
          module.exports = {
            id: "metadata-from-export",
            name: "Export Name",
            version: "2.0.0",
            description: "Export description",
            register(api) {}
          };
        `,
      });

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [plugin.file] },
            allow: ["metadata-from-export"],
          },
        },
      });

      const loaded = registry.plugins.find((p) => p.id === "metadata-from-export");
      expect(loaded?.name).toBe("Export Name");
      expect(loaded?.version).toBe("2.0.0");
      expect(loaded?.description).toBe("Export description");
    });
  });

  describe("manifest file validation", () => {
    it("handles malformed JSON in manifest", () => {
      const dir = makeTempDir();
      const file = path.join(dir, "malformed.js");
      fs.writeFileSync(file, `module.exports = function(api) {};`, "utf-8");
      fs.writeFileSync(path.join(dir, "openclaw.plugin.json"), `{ invalid json`, "utf-8");

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [file] },
            allow: ["malformed"],
          },
        },
      });

      // Plugin won't be discovered due to manifest parse failure
      const plugin = registry.plugins.find((p) => p.source === file);
      expect(plugin).toBeUndefined();
    });

    it("handles missing manifest file", () => {
      const dir = makeTempDir();
      const file = path.join(dir, "no-manifest.js");
      fs.writeFileSync(file, `module.exports = function(api) {};`, "utf-8");
      // No manifest file written

      const registry = loadOpenClawPlugins({
        cache: false,
        config: {
          plugins: {
            load: { paths: [file] },
            allow: ["no-manifest"],
          },
        },
      });

      // Plugin won't be discovered without manifest
      const plugin = registry.plugins.find((p) => p.source === file);
      expect(plugin).toBeUndefined();
    });
  });
});
