import { describe, expect, it } from "vitest";
import { ExecToolBuilder, buildExecToolConfigFromDefaults } from "./exec-tool-builder.js";

describe("ExecToolBuilder", () => {
  it("returns a frozen ExecToolConfig with all default values when nothing is set", () => {
    const cfg = new ExecToolBuilder().build();
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(cfg.defaultTimeoutSec).toBe(1800);
    expect(cfg.allowBackground).toBe(true);
    expect(cfg.defaultPathPrepend).toEqual([]);
    expect(cfg.notifyOnExit).toBe(true);
    expect(cfg.notifySessionKey).toBeUndefined();
    expect(cfg.agentId).toBeUndefined();
    expect(cfg.defaultBackgroundMs).toBe(10_000);
  });

  it("withTimeouts clamps backgroundMs into [10, 120000] and falls back to 10000 on bad input", () => {
    const cfg = new ExecToolBuilder().withTimeouts({ backgroundMs: 1_000_000 }).build();
    expect(cfg.defaultBackgroundMs).toBe(120_000);

    const tiny = new ExecToolBuilder().withTimeouts({ backgroundMs: 5 }).build();
    expect(tiny.defaultBackgroundMs).toBe(10);

    const fallback = new ExecToolBuilder().withTimeouts({ backgroundMs: undefined }).build();
    expect(fallback.defaultBackgroundMs).toBe(10_000);
  });

  it("withTimeouts treats non-positive timeoutSec as the default 1800", () => {
    const negative = new ExecToolBuilder().withTimeouts({ timeoutSec: -5 }).build();
    expect(negative.defaultTimeoutSec).toBe(1800);

    const zero = new ExecToolBuilder().withTimeouts({ timeoutSec: 0 }).build();
    expect(zero.defaultTimeoutSec).toBe(1800);

    const ok = new ExecToolBuilder().withTimeouts({ timeoutSec: 600 }).build();
    expect(ok.defaultTimeoutSec).toBe(600);
  });

  it("withTimeouts allowBackground defaults to true; explicit false is preserved", () => {
    const def = new ExecToolBuilder().withTimeouts({}).build();
    expect(def.allowBackground).toBe(true);

    const off = new ExecToolBuilder().withTimeouts({ allowBackground: false }).build();
    expect(off.allowBackground).toBe(false);
  });

  it("withSandbox dedupes and trims path-prepend entries; ignores non-strings", () => {
    const cfg = new ExecToolBuilder()
      .withSandbox({
        pathPrepend: ["  /a  ", "/a", "/b", "", "  ", "/b", "/c"],
      })
      .build();
    expect(cfg.defaultPathPrepend).toEqual(["/a", "/b", "/c"]);
  });

  it("withSandbox returns an empty array when pathPrepend is missing or non-array", () => {
    const cfg = new ExecToolBuilder().withSandbox({}).build();
    expect(cfg.defaultPathPrepend).toEqual([]);
  });

  it("withNotifications: notifyOnExit defaults to true; explicit false sticks", () => {
    const def = new ExecToolBuilder().withNotifications({}).build();
    expect(def.notifyOnExit).toBe(true);

    const off = new ExecToolBuilder().withNotifications({ notifyOnExit: false }).build();
    expect(off.notifyOnExit).toBe(false);
  });

  it("withNotifications: trims sessionKey; whitespace-only collapses to undefined", () => {
    const trimmed = new ExecToolBuilder().withNotifications({ sessionKey: "  abc  " }).build();
    expect(trimmed.notifySessionKey).toBe("abc");

    const blank = new ExecToolBuilder().withNotifications({ sessionKey: "   " }).build();
    expect(blank.notifySessionKey).toBeUndefined();
  });

  it("withApproval: undefined falls back to module default; non-finite collapses to default; <=0 stays 0", () => {
    const def = new ExecToolBuilder().withApproval({}).build();
    expect(def.approvalRunningNoticeMs).toBeGreaterThanOrEqual(0);

    const zero = new ExecToolBuilder().withApproval({ approvalRunningNoticeMs: 0 }).build();
    expect(zero.approvalRunningNoticeMs).toBe(0);

    const positive = new ExecToolBuilder()
      .withApproval({ approvalRunningNoticeMs: 5_500.7 })
      .build();
    expect(positive.approvalRunningNoticeMs).toBe(5_500);
  });

  it("withSessionContext: explicit agentId wins over session-key parsing", () => {
    const cfg = new ExecToolBuilder()
      .withSessionContext({ agentId: "explicit-agent", sessionKey: "agent.foo.session" })
      .build();
    expect(cfg.agentId).toBe("explicit-agent");
  });

  it("withSessionContext: no agentId, no agent session key -> undefined agentId", () => {
    const cfg = new ExecToolBuilder().withSessionContext({}).build();
    expect(cfg.agentId).toBeUndefined();
  });

  it("buildExecToolConfigFromDefaults wires every group at once and matches per-method results", () => {
    const cfg = buildExecToolConfigFromDefaults({
      backgroundMs: 30_000,
      timeoutSec: 600,
      pathPrepend: ["/a", "/a"],
      notifyOnExit: false,
      sessionKey: " sess ",
      agentId: "x",
      approvalRunningNoticeMs: 1234,
    });
    expect(cfg.defaultBackgroundMs).toBe(30_000);
    expect(cfg.defaultTimeoutSec).toBe(600);
    expect(cfg.defaultPathPrepend).toEqual(["/a"]);
    expect(cfg.notifyOnExit).toBe(false);
    expect(cfg.notifySessionKey).toBe("sess");
    expect(cfg.agentId).toBe("x");
    expect(cfg.approvalRunningNoticeMs).toBe(1234);
  });
});
