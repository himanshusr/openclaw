/**
 * Template Method for channel inbound message processing.
 *
 * Every channel adapter (Telegram, Discord, Slack, Signal, WhatsApp, ...)
 * runs the same 4-step inbound pipeline:
 *
 *   parse(raw) -> applyPolicy(msg) -> routeToSession(msg) -> dispatchToAgent(s, msg)
 *
 * The order, error handling, and abort semantics are identical across
 * channels; only the deserialization step (and sometimes the policy
 * input shaping) is channel-specific. This module captures that skeleton
 * once as an abstract base class so adapters override only what is
 * actually channel-specific.
 *
 * Per the issue Non-goals, this PR lands the infrastructure only and
 * adds focused unit tests; live channel adapters are migrated in
 * follow-up PRs (Telegram + Discord first).
 */

export type ParseResult<TMessage> =
  | { kind: "message"; message: TMessage }
  | { kind: "ignored"; reason: string };

export type PolicyResult =
  | { kind: "process" }
  | { kind: "deny"; reason: string }
  | { kind: "respond-then-stop"; replyText: string };

export type RouteResult<TSession> =
  | { kind: "routed"; session: TSession }
  | { kind: "no-session"; reason: string };

export type DispatchOutcome =
  | { kind: "dispatched" }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; error: unknown };

export type PipelineResult<TMessage, TSession> =
  | { stage: "parse"; outcome: ParseResult<TMessage> }
  | { stage: "policy"; outcome: PolicyResult; message: TMessage }
  | { stage: "route"; outcome: RouteResult<TSession>; message: TMessage }
  | { stage: "dispatch"; outcome: DispatchOutcome; message: TMessage; session: TSession };

export type PipelineErrorHandler = (stage: string, error: unknown) => void;

/**
 * The Template Method base class.
 *
 * Concrete channel pipelines extend this class and override:
 *   - parse(raw)         -- always required (channel-specific deserialization)
 *   - applyPolicy(msg)   -- usually defaults to process; override to call the
 *                            shared policy mediator
 *   - routeToSession(msg)-- override to look up the session from your registry
 *   - dispatchToAgent(s, msg) -- override to call your agent runner
 *
 * The skeleton process(raw) cannot be overridden (it's the contract).
 */
export abstract class InboundMessagePipeline<TRaw, TMessage, TSession> {
  protected readonly onError: PipelineErrorHandler;

  constructor(opts?: { onError?: PipelineErrorHandler }) {
    this.onError = opts?.onError ?? (() => {});
  }

  /**
   * The Template Method. Sequencing and error trapping live here exactly once;
   * subclasses cannot reorder these steps.
   */
  async process(raw: TRaw): Promise<PipelineResult<TMessage, TSession>> {
    let parseResult: ParseResult<TMessage>;
    try {
      parseResult = await this.parse(raw);
    } catch (error) {
      this.onError("parse", error);
      return { stage: "parse", outcome: { kind: "ignored", reason: "parse-error" } };
    }
    if (parseResult.kind === "ignored") {
      return { stage: "parse", outcome: parseResult };
    }
    const message = parseResult.message;

    let policyResult: PolicyResult;
    try {
      policyResult = await this.applyPolicy(message);
    } catch (error) {
      this.onError("policy", error);
      return { stage: "policy", outcome: { kind: "deny", reason: "policy-error" }, message };
    }
    if (policyResult.kind !== "process") {
      return { stage: "policy", outcome: policyResult, message };
    }

    let routeResult: RouteResult<TSession>;
    try {
      routeResult = await this.routeToSession(message);
    } catch (error) {
      this.onError("route", error);
      return { stage: "route", outcome: { kind: "no-session", reason: "route-error" }, message };
    }
    if (routeResult.kind !== "routed") {
      return { stage: "route", outcome: routeResult, message };
    }
    const session = routeResult.session;

    let dispatchOutcome: DispatchOutcome;
    try {
      dispatchOutcome = await this.dispatchToAgent(session, message);
    } catch (error) {
      this.onError("dispatch", error);
      dispatchOutcome = { kind: "failed", error };
    }
    return { stage: "dispatch", outcome: dispatchOutcome, message, session };
  }

  /** Channel-specific deserialization. Always overridden. */
  protected abstract parse(raw: TRaw): Promise<ParseResult<TMessage>> | ParseResult<TMessage>;

  /** Default: pass through. Override to call ChannelPolicyMediator.shouldProcess. */
  protected applyPolicy(_message: TMessage): Promise<PolicyResult> | PolicyResult {
    return { kind: "process" };
  }

  /** Default: deny -- subclass must wire its session registry. */
  protected routeToSession(
    _message: TMessage,
  ): Promise<RouteResult<TSession>> | RouteResult<TSession> {
    return { kind: "no-session", reason: "routeToSession not implemented" };
  }

  /** Default: skipped -- subclass must wire its agent runner. */
  protected dispatchToAgent(
    _session: TSession,
    _message: TMessage,
  ): Promise<DispatchOutcome> | DispatchOutcome {
    return { kind: "skipped", reason: "dispatchToAgent not implemented" };
  }
}
