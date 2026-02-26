import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CLI Command Routing and Argument Parsing Tests
 *
 * Purpose: Verify that CLI commands route to correct handlers and parse arguments properly
 * Scope: Tests command wiring without executing actual command logic
 *
 * Test Coverage:
 * - Command routing for key subcommands
 * - Argument/flag parsing
 * - Error cases (unknown commands, missing required args)
 */

// Mock runtime to prevent actual execution
const runtime = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(() => {
    throw new Error("exit");
  }),
};

// Mock command handlers
const gatewayRunHandler = vi.fn();
const gatewayStatusHandler = vi.fn();
const gatewayInstallHandler = vi.fn();
const channelsAddHandler = vi.fn();
const channelsLoginHandler = vi.fn();
const agentHandler = vi.fn();
const setupHandler = vi.fn();

// Mock dependencies
vi.mock("../runtime.js", () => ({ defaultRuntime: runtime }));
vi.mock("./plugin-registry.js", () => ({ ensurePluginRegistryLoaded: () => undefined }));
vi.mock("../commands/doctor-config-flow.js", () => ({
  loadAndMaybeMigrateDoctorConfig: vi.fn()
}));
vi.mock("./program/config-guard.js", () => ({
  ensureConfigReady: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("./deps.js", () => ({ createDefaultDeps: () => ({}) }));
vi.mock("./preaction.js", () => ({ registerPreActionHooks: () => {} }));
vi.mock("../commands/setup.js", () => ({ setupCommand: setupHandler }));
vi.mock("../commands/agent.ts", () => ({ agentCommand: agentHandler }));
vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(),
  randomIdempotencyKey: () => "test-key",
  buildGatewayConnectionDetails: () => ({
    url: "ws://127.0.0.1:1234",
    urlSource: "test",
    message: "Gateway target: ws://127.0.0.1:1234",
  }),
}));

// Mock gateway CLI registration with command handlers
vi.mock("./gateway-cli/register.js", () => ({
  registerGatewayCli: (program: Command) => {
    const gateway = program.command("gateway").description("Run the WebSocket Gateway");

    gateway
      .command("run")
      .description("Run the WebSocket Gateway (foreground)")
      .option("--port <port>", "Gateway port")
      .option("--bind <address>", "Bind address")
      .option("--force", "Force restart if already running")
      .action(gatewayRunHandler);

    gateway
      .command("status")
      .description("Show gateway service status")
      .option("--url <url>", "Gateway WebSocket URL")
      .option("--token <token>", "Gateway token")
      .option("--timeout <ms>", "Timeout in ms", "10000")
      .option("--json", "Output JSON", false)
      .action(gatewayStatusHandler);

    gateway
      .command("install")
      .description("Install the Gateway service")
      .option("--port <port>", "Gateway port")
      .option("--runtime <runtime>", "Daemon runtime")
      .option("--force", "Reinstall if already installed", false)
      .action(gatewayInstallHandler);
  },
}));

// Mock channels CLI registration
vi.mock("./channels-cli.js", () => ({
  registerChannelsCli: (program: Command) => {
    const channels = program.command("channels").description("Channel management");

    channels
      .command("add")
      .description("Add a channel")
      .requiredOption("--channel <channel>", "Channel type")
      .option("--account <account>", "Account name")
      .action(channelsAddHandler);

    channels
      .command("login")
      .description("Log in to a channel")
      .option("--channel <channel>", "Channel type")
      .option("--account <account>", "Account name")
      .action(channelsLoginHandler);
  },
}));

const { buildProgram } = await import("./program.js");

describe("CLI Command Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Gateway Command Routing", () => {
    it("routes 'gateway run' to the correct handler", async () => {
      const program = buildProgram();
      await program.parseAsync(["gateway", "run"], { from: "user" });

      expect(gatewayRunHandler).toHaveBeenCalledTimes(1);
    });

    it("routes 'gateway status' to the correct handler", async () => {
      const program = buildProgram();
      await program.parseAsync(["gateway", "status"], { from: "user" });

      expect(gatewayStatusHandler).toHaveBeenCalledTimes(1);
    });

    it("routes 'gateway install' to the correct handler", async () => {
      const program = buildProgram();
      await program.parseAsync(["gateway", "install"], { from: "user" });

      expect(gatewayInstallHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Channels Command Routing", () => {
    it("routes 'channels add' to the correct handler", async () => {
      const program = buildProgram();
      await program.parseAsync(["channels", "add", "--channel", "discord"], { from: "user" });

      expect(channelsAddHandler).toHaveBeenCalledTimes(1);
    });

    it("routes 'channels login' to the correct handler", async () => {
      const program = buildProgram();
      await program.parseAsync(["channels", "login"], { from: "user" });

      expect(channelsLoginHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Top-level Command Routing", () => {
    it("registers gateway command", () => {
      const program = buildProgram();
      const commandNames = program.commands.map((cmd) => cmd.name());

      expect(commandNames).toContain("gateway");
    });

    it("registers channels command", () => {
      const program = buildProgram();
      const commandNames = program.commands.map((cmd) => cmd.name());

      expect(commandNames).toContain("channels");
    });

    it("registers setup command", () => {
      const program = buildProgram();
      const commandNames = program.commands.map((cmd) => cmd.name());

      expect(commandNames).toContain("setup");
    });

    it("registers agent command", () => {
      const program = buildProgram();
      const commandNames = program.commands.map((cmd) => cmd.name());

      expect(commandNames).toContain("agent");
    });
  });
});

describe("CLI Argument Parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Gateway Run Arguments", () => {
    it("parses --port flag correctly", async () => {
      const program = buildProgram();
      await program.parseAsync(["gateway", "run", "--port", "8080"], { from: "user" });

      expect(gatewayRunHandler).toHaveBeenCalledWith(
        expect.objectContaining({ port: "8080" }),
        expect.anything()
      );
    });

    it("parses --bind flag correctly", async () => {
      const program = buildProgram();
      await program.parseAsync(["gateway", "run", "--bind", "0.0.0.0"], { from: "user" });

      expect(gatewayRunHandler).toHaveBeenCalledWith(
        expect.objectContaining({ bind: "0.0.0.0" }),
        expect.anything()
      );
    });

    it("parses --force flag correctly", async () => {
      const program = buildProgram();
      await program.parseAsync(["gateway", "run", "--force"], { from: "user" });

      expect(gatewayRunHandler).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
        expect.anything()
      );
    });

    it("parses multiple flags together", async () => {
      const program = buildProgram();
      await program.parseAsync(
        ["gateway", "run", "--port", "9000", "--bind", "127.0.0.1", "--force"],
        { from: "user" }
      );

      expect(gatewayRunHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          port: "9000",
          bind: "127.0.0.1",
          force: true,
        }),
        expect.anything()
      );
    });
  });

  describe("Gateway Status Arguments", () => {
    it("parses --url flag correctly", async () => {
      const program = buildProgram();
      await program.parseAsync(
        ["gateway", "status", "--url", "ws://localhost:8080"],
        { from: "user" }
      );

      expect(gatewayStatusHandler).toHaveBeenCalledWith(
        expect.objectContaining({ url: "ws://localhost:8080" }),
        expect.anything()
      );
    });

    it("parses --token flag correctly", async () => {
      const program = buildProgram();
      await program.parseAsync(
        ["gateway", "status", "--token", "secret-token"],
        { from: "user" }
      );

      expect(gatewayStatusHandler).toHaveBeenCalledWith(
        expect.objectContaining({ token: "secret-token" }),
        expect.anything()
      );
    });

    it("parses --timeout flag correctly", async () => {
      const program = buildProgram();
      await program.parseAsync(
        ["gateway", "status", "--timeout", "5000"],
        { from: "user" }
      );

      expect(gatewayStatusHandler).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: "5000" }),
        expect.anything()
      );
    });

    it("parses --json flag correctly", async () => {
      const program = buildProgram();
      await program.parseAsync(["gateway", "status", "--json"], { from: "user" });

      expect(gatewayStatusHandler).toHaveBeenCalledWith(
        expect.objectContaining({ json: true }),
        expect.anything()
      );
    });
  });

  describe("Gateway Install Arguments", () => {
    it("parses --port flag correctly", async () => {
      const program = buildProgram();
      await program.parseAsync(["gateway", "install", "--port", "3000"], { from: "user" });

      expect(gatewayInstallHandler).toHaveBeenCalledWith(
        expect.objectContaining({ port: "3000" }),
        expect.anything()
      );
    });

    it("parses --runtime flag correctly", async () => {
      const program = buildProgram();
      await program.parseAsync(
        ["gateway", "install", "--runtime", "bun"],
        { from: "user" }
      );

      expect(gatewayInstallHandler).toHaveBeenCalledWith(
        expect.objectContaining({ runtime: "bun" }),
        expect.anything()
      );
    });

    it("parses --force flag correctly", async () => {
      const program = buildProgram();
      await program.parseAsync(["gateway", "install", "--force"], { from: "user" });

      expect(gatewayInstallHandler).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
        expect.anything()
      );
    });
  });

  describe("Channels Arguments", () => {
    it("parses required --channel flag for add command", async () => {
      const program = buildProgram();
      await program.parseAsync(
        ["channels", "add", "--channel", "slack"],
        { from: "user" }
      );

      expect(channelsAddHandler).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "slack" }),
        expect.anything()
      );
    });

    it("parses optional --account flag", async () => {
      const program = buildProgram();
      await program.parseAsync(
        ["channels", "add", "--channel", "discord", "--account", "work"],
        { from: "user" }
      );

      expect(channelsAddHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "discord",
          account: "work",
        }),
        expect.anything()
      );
    });
  });
});

describe("CLI Error Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Unknown Commands", () => {
    it("handles unknown top-level command", async () => {
      const program = buildProgram();
      program.exitOverride();

      await expect(
        program.parseAsync(["unknown-command"], { from: "user" })
      ).rejects.toThrow();
    });

    it("handles unknown subcommand", async () => {
      const program = buildProgram();
      program.exitOverride();

      await expect(
        program.parseAsync(["gateway", "unknown-subcommand"], { from: "user" })
      ).rejects.toThrow();
    });
  });

  describe("Missing Required Arguments", () => {
    it("fails when required --channel flag is missing", async () => {
      const program = buildProgram();
      program.exitOverride();

      await expect(
        program.parseAsync(["channels", "add"], { from: "user" })
      ).rejects.toThrow();
    });

    it("fails when required argument has no value", async () => {
      const program = buildProgram();
      program.exitOverride();

      await expect(
        program.parseAsync(["channels", "add", "--channel"], { from: "user" })
      ).rejects.toThrow();
    });
  });

  describe("Invalid Argument Values", () => {
    it("accepts valid port number", async () => {
      const program = buildProgram();
      await program.parseAsync(["gateway", "run", "--port", "8080"], { from: "user" });

      expect(gatewayRunHandler).toHaveBeenCalledWith(
        expect.objectContaining({ port: "8080" }),
        expect.anything()
      );
    });

    it("accepts valid timeout value", async () => {
      const program = buildProgram();
      await program.parseAsync(
        ["gateway", "status", "--timeout", "15000"],
        { from: "user" }
      );

      expect(gatewayStatusHandler).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: "15000" }),
        expect.anything()
      );
    });
  });
});
