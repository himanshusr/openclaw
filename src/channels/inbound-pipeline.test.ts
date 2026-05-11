import { describe, expect, it, vi } from "vitest";
import { InboundMessagePipeline } from "./inbound-pipeline.js";

type RawTg = { update_id: number; from: string; text?: string };
type Msg = { id: number; sender: string; text: string };
type Session = { sessionId: string };

class TgPipeline extends InboundMessagePipeline<RawTg, Msg, Session> {
  constructor(
    private readonly hooks: {
      policy?: (m: Msg) => "process" | "deny" | "respond";
      route?: (m: Msg) => Session | null;
      dispatch?: (s: Session, m: Msg) => "ok" | "skip" | "fail";
    } = {},
    onError?: (stage: string, e: unknown) => void,
  ) {
    super({ onError });
  }

  protected parse(raw: RawTg) {
    if (!raw.text) {
      return { kind: "ignored" as const, reason: "no text" };
    }
    return {
      kind: "message" as const,
      message: { id: raw.update_id, sender: raw.from, text: raw.text },
    };
  }

  protected applyPolicy(m: Msg) {
    const p = this.hooks.policy?.(m) ?? "process";
    if (p === "process") {
      return { kind: "process" as const };
    }
    if (p === "respond") {
      return { kind: "respond-then-stop" as const, replyText: "pairing required" };
    }
    return { kind: "deny" as const, reason: "policy denied" };
  }

  protected routeToSession(m: Msg) {
    const s = this.hooks.route ? this.hooks.route(m) : { sessionId: m.sender };
    if (!s) {
      return { kind: "no-session" as const, reason: "no session" };
    }
    return { kind: "routed" as const, session: s };
  }

  protected dispatchToAgent(s: Session, m: Msg) {
    const r = this.hooks.dispatch?.(s, m) ?? "ok";
    if (r === "ok") {
      return { kind: "dispatched" as const };
    }
    if (r === "skip") {
      return { kind: "skipped" as const, reason: "dispatcher skipped" };
    }
    return { kind: "failed" as const, error: new Error("boom") };
  }
}

describe("InboundMessagePipeline (Template Method)", () => {
  const raw: RawTg = { update_id: 1, from: "alice", text: "hi" };

  it("runs all 4 steps in order on a happy path", async () => {
    const pipeline = new TgPipeline();
    const result = await pipeline.process(raw);
    expect(result.stage).toBe("dispatch");
    expect(result.outcome).toEqual({ kind: "dispatched" });
  });

  it("stops at parse when the channel cannot extract a message", async () => {
    const pipeline = new TgPipeline();
    const result = await pipeline.process({ update_id: 2, from: "alice" });
    expect(result.stage).toBe("parse");
    expect(result.outcome).toEqual({ kind: "ignored", reason: "no text" });
  });

  it("stops at policy when policy denies", async () => {
    const pipeline = new TgPipeline({ policy: () => "deny" });
    const result = await pipeline.process(raw);
    expect(result.stage).toBe("policy");
    expect(result.outcome).toMatchObject({ kind: "deny" });
  });

  it("stops at policy with respond-then-stop and surfaces the reply text", async () => {
    const pipeline = new TgPipeline({ policy: () => "respond" });
    const result = await pipeline.process(raw);
    expect(result.stage).toBe("policy");
    expect(result.outcome).toEqual({
      kind: "respond-then-stop",
      replyText: "pairing required",
    });
  });

  it("stops at route when no session is found", async () => {
    const pipeline = new TgPipeline({ route: () => null });
    const result = await pipeline.process(raw);
    expect(result.stage).toBe("route");
    expect(result.outcome).toMatchObject({ kind: "no-session" });
  });

  it("reports dispatch returning 'fail' as a failed outcome (without throwing)", async () => {
    const pipeline = new TgPipeline({ dispatch: () => "fail" });
    const result = await pipeline.process(raw);
    expect(result.stage).toBe("dispatch");
    expect(result.outcome.kind).toBe("failed");
  });

  it("reports dispatch returning 'skip' as a skipped outcome", async () => {
    const pipeline = new TgPipeline({ dispatch: () => "skip" });
    const result = await pipeline.process(raw);
    expect(result.stage).toBe("dispatch");
    expect(result.outcome).toMatchObject({ kind: "skipped" });
  });

  it("traps an exception thrown in parse and reports parse-error", async () => {
    class ThrowingParse extends TgPipeline {
      protected parse(): never {
        throw new Error("boom-parse");
      }
    }
    const onError = vi.fn();
    const pipeline = new ThrowingParse({}, onError);
    const result = await pipeline.process(raw);
    expect(result.stage).toBe("parse");
    expect(result.outcome).toEqual({ kind: "ignored", reason: "parse-error" });
    expect(onError).toHaveBeenCalledWith("parse", expect.any(Error));
  });

  it("traps an exception thrown in policy and reports policy-error", async () => {
    class ThrowingPolicy extends TgPipeline {
      protected applyPolicy(): never {
        throw new Error("boom-policy");
      }
    }
    const onError = vi.fn();
    const pipeline = new ThrowingPolicy({}, onError);
    const result = await pipeline.process(raw);
    expect(result.stage).toBe("policy");
    expect(result.outcome.kind).toBe("deny");
    expect(onError).toHaveBeenCalledWith("policy", expect.any(Error));
  });

  it("traps an exception thrown in dispatch and tags it failed", async () => {
    class ThrowingDispatch extends TgPipeline {
      protected dispatchToAgent(): never {
        throw new Error("boom-dispatch");
      }
    }
    const onError = vi.fn();
    const pipeline = new ThrowingDispatch({}, onError);
    const result = await pipeline.process(raw);
    expect(result.stage).toBe("dispatch");
    expect(result.outcome.kind).toBe("failed");
    expect(onError).toHaveBeenCalledWith("dispatch", expect.any(Error));
  });

  it("the default base routeToSession returns no-session if not overridden", async () => {
    class MinimalPipeline extends InboundMessagePipeline<RawTg, Msg, Session> {
      protected parse(raw: RawTg) {
        return {
          kind: "message" as const,
          message: { id: raw.update_id, sender: raw.from, text: raw.text ?? "" },
        };
      }
    }
    const pipeline = new MinimalPipeline();
    const result = await pipeline.process(raw);
    expect(result.stage).toBe("route");
    expect(result.outcome).toMatchObject({ kind: "no-session" });
  });
});
