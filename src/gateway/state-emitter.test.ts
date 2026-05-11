import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { GatewayStateEmitter } from "./state-emitter.js";

const baseConfig = (): OpenClawConfig => ({});

describe("GatewayStateEmitter (#58)", () => {
  it("starts with an initial config snapshot and presence", () => {
    const emitter = new GatewayStateEmitter({
      config: { agent: { model: "x" } } as OpenClawConfig,
    });
    expect(emitter.currentPresence()).toBe("starting");
    expect(emitter.currentConfig()).toEqual({ agent: { model: "x" } });
  });

  it("notifies all subscribers on a config change and updates the snapshot", () => {
    const emitter = new GatewayStateEmitter({ config: baseConfig() });
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    emitter.on("configChanged", handlerA);
    emitter.on("configChanged", handlerB);

    const next = { agent: { model: "next" } } as OpenClawConfig;
    emitter.publishConfigChange({
      prev: baseConfig(),
      next,
      changedPaths: ["agent.model"],
    });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(emitter.currentConfig()).toEqual(next);
    const args = handlerA.mock.calls[0]?.[0];
    expect(args.changedPaths).toEqual(["agent.model"]);
  });

  it("returns an unsubscribe that detaches the handler", () => {
    const emitter = new GatewayStateEmitter({ config: baseConfig() });
    const handler = vi.fn();
    const off = emitter.on("configChanged", handler);
    off();
    emitter.publishConfigChange({
      prev: baseConfig(),
      next: baseConfig(),
      changedPaths: [],
    });
    expect(handler).not.toHaveBeenCalled();
    expect(emitter.listenerCount("configChanged")).toBe(0);
  });

  it("dedupes presence changes when the new state matches the current state", () => {
    const emitter = new GatewayStateEmitter({ config: baseConfig(), presence: "running" });
    const handler = vi.fn();
    emitter.on("presenceChanged", handler);

    emitter.publishPresenceChange("running"); // no-op
    expect(handler).not.toHaveBeenCalled();

    emitter.publishPresenceChange("degraded", { reason: "config-reload" });
    expect(handler).toHaveBeenCalledTimes(1);
    const change = handler.mock.calls[0]?.[0];
    expect(change).toMatchObject({ prev: "running", next: "degraded", reason: "config-reload" });
    expect(emitter.currentPresence()).toBe("degraded");
  });

  it("isolates configChanged and presenceChanged streams", () => {
    const emitter = new GatewayStateEmitter({ config: baseConfig() });
    const presenceHandler = vi.fn();
    emitter.on("presenceChanged", presenceHandler);

    emitter.publishConfigChange({
      prev: baseConfig(),
      next: baseConfig(),
      changedPaths: [],
    });
    expect(presenceHandler).not.toHaveBeenCalled();
  });
});
