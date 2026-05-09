import { describe, expect, it, vi } from "vitest";
import {
  type AuthSubsystem,
  type ChannelSubsystem,
  type CronSubsystem,
  type GatewayFacadeDeps,
  type SessionSubsystem,
  type WebhookSubsystem,
  createGatewayFacade,
} from "./facade.js";

function makeDeps(overrides: Partial<GatewayFacadeDeps> = {}): GatewayFacadeDeps {
  const sessions: SessionSubsystem = {
    list: vi
      .fn()
      .mockResolvedValue([
        { sessionId: "s1", agentId: "a", channel: "telegram", presence: "online" },
      ]),
    get: vi.fn().mockResolvedValue(null),
    start: vi.fn().mockImplementation(async (d) => d),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const channels: ChannelSubsystem = {
    list: vi.fn().mockResolvedValue([{ kind: "telegram", status: "running" as const }]),
    bootAll: vi.fn().mockResolvedValue({ booted: ["telegram"], failed: [] }),
    shutdownAll: vi.fn().mockResolvedValue(undefined),
  };
  const auth: AuthSubsystem = {
    validateToken: vi.fn().mockResolvedValue({ ok: true, principal: "p" }),
  };
  const cron: CronSubsystem = {
    schedule: vi.fn(),
    unschedule: vi.fn(),
    list: vi.fn().mockReturnValue([{ id: "j1", cron: "* * * * *", payload: "{}" }]),
  };
  const webhooks: WebhookSubsystem = {
    route: vi.fn().mockResolvedValue({ status: 200, bodyText: "ok" }),
  };
  return { sessions, channels, auth, cron, webhooks, ...overrides };
}

describe("GatewayFacade", () => {
  it("exposes the five subsystems by reference", () => {
    const deps = makeDeps();
    const facade = createGatewayFacade(deps);
    expect(facade.sessions).toBe(deps.sessions);
    expect(facade.channels).toBe(deps.channels);
    expect(facade.auth).toBe(deps.auth);
    expect(facade.cron).toBe(deps.cron);
    expect(facade.webhooks).toBe(deps.webhooks);
  });

  it("start() boots all channels and reports their statuses", async () => {
    const deps = makeDeps();
    const facade = createGatewayFacade(deps);
    const result = await facade.start();
    expect(deps.channels.bootAll).toHaveBeenCalledOnce();
    expect(result).toEqual({ channelsBooted: ["telegram"], channelsFailed: [] });
  });

  it("start() is idempotent (no double boot)", async () => {
    const deps = makeDeps();
    const facade = createGatewayFacade(deps);
    await facade.start();
    const second = await facade.start();
    expect(deps.channels.bootAll).toHaveBeenCalledOnce();
    expect(second).toEqual({ channelsBooted: [], channelsFailed: [] });
  });

  it("stop() stops every session, then shuts channels down", async () => {
    const deps = makeDeps();
    const facade = createGatewayFacade(deps);
    await facade.start();
    await facade.stop();
    expect(deps.sessions.stop).toHaveBeenCalledWith("s1");
    expect(deps.channels.shutdownAll).toHaveBeenCalledOnce();
  });

  it("stop() is a no-op if start() was never called", async () => {
    const deps = makeDeps();
    const facade = createGatewayFacade(deps);
    await facade.stop();
    expect(deps.sessions.stop).not.toHaveBeenCalled();
    expect(deps.channels.shutdownAll).not.toHaveBeenCalled();
  });

  it("status() pulls sessions, channels and cron jobs in one call", async () => {
    const deps = makeDeps();
    const facade = createGatewayFacade(deps);
    const status = await facade.status();
    expect(status).toEqual({
      sessions: [{ sessionId: "s1", agentId: "a", channel: "telegram", presence: "online" }],
      channels: [{ kind: "telegram", status: "running" }],
      cronJobs: [{ id: "j1", cron: "* * * * *", payload: "{}" }],
    });
  });

  it("delegates webhook routing to the webhooks subsystem", async () => {
    const deps = makeDeps();
    const facade = createGatewayFacade(deps);
    const resp = await facade.webhooks.route({
      path: "/x",
      method: "POST",
      headers: {},
      bodyText: "",
    });
    expect(resp).toEqual({ status: 200, bodyText: "ok" });
    expect(deps.webhooks.route).toHaveBeenCalledOnce();
  });

  it("reports failed channels alongside booted ones", async () => {
    const deps = makeDeps({
      channels: {
        list: vi.fn().mockResolvedValue([]),
        bootAll: vi.fn().mockResolvedValue({ booted: ["telegram"], failed: ["discord"] }),
        shutdownAll: vi.fn().mockResolvedValue(undefined),
      },
    });
    const facade = createGatewayFacade(deps);
    const result = await facade.start();
    expect(result).toEqual({ channelsBooted: ["telegram"], channelsFailed: ["discord"] });
  });
});
