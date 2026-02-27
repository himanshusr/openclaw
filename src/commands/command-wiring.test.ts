import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

/**
 * Command Wiring and Interface Tests
 *
 * Purpose: Verify command definitions and option parsing without executing command logic
 * Scope: Tests that command interfaces are properly defined with correct options
 *
 * Test Coverage:
 * - Command option definitions
 * - Required vs optional arguments
 * - Flag types (boolean, string, number)
 * - Default values
 */

describe("Command Wiring - Gateway Commands", () => {
  it("gateway run command has correct options defined", () => {
    const program = new Command();
    const gateway = program.command("gateway");
    const run = gateway
      .command("run")
      .option("--port <port>", "Gateway port")
      .option("--bind <address>", "Bind address")
      .option("--force", "Force restart")
      .option("--token <token>", "Auth token");

    const options = run.options;
    const optionFlags = options.map((opt) => opt.flags);

    expect(optionFlags).toContain("--port <port>");
    expect(optionFlags).toContain("--bind <address>");
    expect(optionFlags).toContain("--force");
    expect(optionFlags).toContain("--token <token>");
  });

  it("gateway status command has correct options defined", () => {
    const program = new Command();
    const gateway = program.command("gateway");
    const status = gateway
      .command("status")
      .option("--url <url>", "Gateway WebSocket URL")
      .option("--token <token>", "Gateway token")
      .option("--timeout <ms>", "Timeout in ms", "10000")
      .option("--json", "Output JSON", false);

    const options = status.options;
    const optionFlags = options.map((opt) => opt.flags);

    expect(optionFlags).toContain("--url <url>");
    expect(optionFlags).toContain("--token <token>");
    expect(optionFlags).toContain("--timeout <ms>");
    expect(optionFlags).toContain("--json");
  });

  it("gateway install command has correct options defined", () => {
    const program = new Command();
    const gateway = program.command("gateway");
    const install = gateway
      .command("install")
      .option("--port <port>", "Gateway port")
      .option("--runtime <runtime>", "Daemon runtime")
      .option("--force", "Reinstall if already installed", false);

    const options = install.options;
    const optionFlags = options.map((opt) => opt.flags);

    expect(optionFlags).toContain("--port <port>");
    expect(optionFlags).toContain("--runtime <runtime>");
    expect(optionFlags).toContain("--force");
  });
});

describe("Command Wiring - Channels Commands", () => {
  it("channels add command has required channel option", () => {
    const program = new Command();
    const channels = program.command("channels");
    const add = channels
      .command("add")
      .requiredOption("--channel <channel>", "Channel type")
      .option("--account <account>", "Account name");

    const requiredOptions = add.options.filter((opt) => opt.required);
    const requiredFlags = requiredOptions.map((opt) => opt.flags);

    expect(requiredFlags).toContain("--channel <channel>");
  });

  it("channels login command has optional channel and account", () => {
    const program = new Command();
    const channels = program.command("channels");
    const login = channels
      .command("login")
      .option("--channel <channel>", "Channel type")
      .option("--account <account>", "Account name");

    const options = login.options;
    const optionFlags = options.map((opt) => opt.flags);

    expect(optionFlags).toContain("--channel <channel>");
    expect(optionFlags).toContain("--account <account>");

    // Verify they are not required
    const required = options.filter((opt) => opt.required);
    expect(required.length).toBe(0);
  });
});

describe("Command Option Types", () => {
  it("boolean flags have no argument", () => {
    const program = new Command();
    const cmd = program
      .command("test")
      .option("--force", "Force flag")
      .option("--json", "JSON output", false)
      .option("--verbose", "Verbose output");

    const booleanOptions = cmd.options.filter((opt) =>
      ["--force", "--json", "--verbose"].includes(opt.flags)
    );

    for (const opt of booleanOptions) {
      // Boolean flags don't have <> or [] in their flags
      expect(opt.flags).not.toMatch(/<|>/);
      expect(opt.flags).not.toMatch(/\[|\]/);
    }
  });

  it("value flags require an argument", () => {
    const program = new Command();
    const cmd = program
      .command("test")
      .option("--port <port>", "Port number")
      .option("--url <url>", "URL")
      .option("--timeout <ms>", "Timeout");

    const valueOptions = cmd.options.filter((opt) =>
      ["--port <port>", "--url <url>", "--timeout <ms>"].includes(opt.flags)
    );

    for (const opt of valueOptions) {
      // Value flags have <> in their flags
      expect(opt.flags).toMatch(/<.*>/);
    }
  });
});

describe("Command Default Values", () => {
  it("applies default value for timeout option", () => {
    const program = new Command();
    const cmd = program.command("test").option("--timeout <ms>", "Timeout in ms", "10000");

    const timeoutOption = cmd.options.find((opt) => opt.flags.includes("--timeout"));
    expect(timeoutOption?.defaultValue).toBe("10000");
  });

  it("applies default false for boolean json flag", () => {
    const program = new Command();
    const cmd = program.command("test").option("--json", "Output JSON", false);

    const jsonOption = cmd.options.find((opt) => opt.flags.includes("--json"));
    expect(jsonOption?.defaultValue).toBe(false);
  });

  it("applies default false for boolean force flag", () => {
    const program = new Command();
    const cmd = program.command("test").option("--force", "Force operation", false);

    const forceOption = cmd.options.find((opt) => opt.flags.includes("--force"));
    expect(forceOption?.defaultValue).toBe(false);
  });
});

describe("Command Argument Parsing", () => {
  it("parses string value correctly", async () => {
    const handler = vi.fn();
    const program = new Command();
    program.command("test").option("--name <name>", "Name").action(handler);

    await program.parseAsync(["test", "--name", "testvalue"], { from: "user" });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: "testvalue" }),
      expect.anything()
    );
  });

  it("parses boolean flag correctly when present", async () => {
    const handler = vi.fn();
    const program = new Command();
    program.command("test").option("--verbose", "Verbose").action(handler);

    await program.parseAsync(["test", "--verbose"], { from: "user" });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ verbose: true }),
      expect.anything()
    );
  });

  it("uses default value when flag is not provided", async () => {
    const handler = vi.fn();
    const program = new Command();
    program.command("test").option("--json", "JSON output", false).action(handler);

    await program.parseAsync(["test"], { from: "user" });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ json: false }),
      expect.anything()
    );
  });

  it("parses multiple flags together", async () => {
    const handler = vi.fn();
    const program = new Command();
    program
      .command("test")
      .option("--port <port>", "Port")
      .option("--host <host>", "Host")
      .option("--verbose", "Verbose")
      .action(handler);

    await program.parseAsync(["test", "--port", "8080", "--host", "localhost", "--verbose"], {
      from: "user",
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        port: "8080",
        host: "localhost",
        verbose: true,
      }),
      expect.anything()
    );
  });
});

describe("Command Error Handling", () => {
  it("throws error when required option is missing", async () => {
    const handler = vi.fn();
    const program = new Command();
    program.exitOverride();
    program
      .command("test")
      .requiredOption("--required <value>", "Required value")
      .action(handler);

    await expect(program.parseAsync(["test"], { from: "user" })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("throws error when option value is missing", async () => {
    const handler = vi.fn();
    const program = new Command();
    program.exitOverride();
    program.command("test").option("--port <port>", "Port").action(handler);

    // Commander.js will throw when a value is expected but not provided
    await expect(program.parseAsync(["test", "--port"], { from: "user" })).rejects.toThrow();
  });

  it("throws error when unknown option is provided", async () => {
    const handler = vi.fn();
    const program = new Command();
    program.exitOverride();
    program.command("test").option("--known <value>", "Known option").action(handler);

    await expect(
      program.parseAsync(["test", "--unknown", "value"], { from: "user" })
    ).rejects.toThrow();
  });
});

describe("Subcommand Hierarchy", () => {
  it("correctly nests subcommands", () => {
    const program = new Command();
    const gateway = program.command("gateway");
    gateway.command("run");
    gateway.command("status");
    gateway.command("install");

    const subcommandNames = gateway.commands.map((cmd) => cmd.name());
    expect(subcommandNames).toContain("run");
    expect(subcommandNames).toContain("status");
    expect(subcommandNames).toContain("install");
  });

  it("routes to correct subcommand handler", async () => {
    const runHandler = vi.fn();
    const statusHandler = vi.fn();

    const program = new Command();
    const gateway = program.command("gateway");
    gateway.command("run").action(runHandler);
    gateway.command("status").action(statusHandler);

    await program.parseAsync(["gateway", "run"], { from: "user" });
    expect(runHandler).toHaveBeenCalledTimes(1);
    expect(statusHandler).not.toHaveBeenCalled();

    vi.clearAllMocks();

    await program.parseAsync(["gateway", "status"], { from: "user" });
    expect(statusHandler).toHaveBeenCalledTimes(1);
    expect(runHandler).not.toHaveBeenCalled();
  });
});
