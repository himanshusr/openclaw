/**
 * GatewayFacade -- thin coordinator over the existing gateway collaborators.
 *
 * The current gateway control plane is split across many files
 * (`server.impl.ts`, `auth.ts`, `boot.ts`, `sessions-*.ts`,
 * `server-channels.ts`, `server-runtime-config.ts`, `config-reload.ts`,
 * `server-broadcast.ts`, ...). They are each independently testable,
 * but the public consumer (CLI, macOS app, RPC clients) still has no
 * single entry point that names the high-level subsystems and the order
 * in which they boot. The result is that "what does the gateway expose?"
 * is answered by reading 5+ files.
 *
 * This module introduces a Facade -- a small typed object that names the
 * five major subsystems (sessions, channels, auth, cron, webhooks) and
 * delegates to them. Concrete consumers depend on `GatewayFacade` instead
 * of constructing collaborators directly. This PR lands the abstraction
 * and a test that proves the delegation contract; live wiring of
 * `server.impl.ts` to use the facade is left as a follow-up so the diff
 * stays reviewable (per the issue's Non-goals).
 */

export type SessionId = string;

export type SessionDescriptor = {
  sessionId: SessionId;
  agentId: string;
  channel: string;
  presence: "online" | "offline" | "away";
};

/** Subsystem 1 of 5: session lifecycle. */
export type SessionSubsystem = {
  list(): Promise<SessionDescriptor[]>;
  get(id: SessionId): Promise<SessionDescriptor | null>;
  start(descriptor: SessionDescriptor): Promise<SessionDescriptor>;
  stop(id: SessionId): Promise<void>;
};

/** Subsystem 2 of 5: channel registry + boot order. */
export type ChannelDescriptor = {
  kind: string;
  status: "running" | "stopped" | "error";
  detail?: string;
};

export type ChannelSubsystem = {
  list(): Promise<ChannelDescriptor[]>;
  bootAll(): Promise<{ booted: string[]; failed: string[] }>;
  shutdownAll(): Promise<void>;
};

/** Subsystem 3 of 5: auth gateway (token validation, pairing). */
export type AuthDecision = { ok: true; principal: string } | { ok: false; reason: string };

export type AuthSubsystem = {
  validateToken(raw: string): Promise<AuthDecision>;
};

/** Subsystem 4 of 5: cron / wakeup host. */
export type CronJob = {
  id: string;
  cron: string;
  payload: string;
};

export type CronSubsystem = {
  schedule(job: CronJob): void;
  unschedule(id: string): void;
  list(): CronJob[];
};

/** Subsystem 5 of 5: inbound webhook routing. */
export type WebhookRequest = {
  path: string;
  method: string;
  headers: Record<string, string>;
  bodyText: string;
};

export type WebhookResponse = { status: number; bodyText: string };

export type WebhookSubsystem = {
  route(req: WebhookRequest): Promise<WebhookResponse>;
};

/**
 * The Facade -- exposes a small, opinionated surface to the outside world
 * and delegates to the five collaborators. Construction of collaborators
 * is the caller's responsibility (so tests can pass fakes); the facade
 * only orchestrates them.
 */
export type GatewayFacade = {
  readonly sessions: SessionSubsystem;
  readonly channels: ChannelSubsystem;
  readonly auth: AuthSubsystem;
  readonly cron: CronSubsystem;
  readonly webhooks: WebhookSubsystem;

  /** High-level lifecycle: boot every subsystem in the right order. */
  start(): Promise<{ channelsBooted: string[]; channelsFailed: string[] }>;

  /** Stop everything in reverse order. */
  stop(): Promise<void>;

  /**
   * Single-call status snapshot for `openclaw gateway status` / `doctor`.
   * Pulls from each subsystem so the caller never has to know they exist.
   */
  status(): Promise<{
    sessions: SessionDescriptor[];
    channels: ChannelDescriptor[];
    cronJobs: CronJob[];
  }>;
};

export type GatewayFacadeDeps = {
  sessions: SessionSubsystem;
  channels: ChannelSubsystem;
  auth: AuthSubsystem;
  cron: CronSubsystem;
  webhooks: WebhookSubsystem;
};

export function createGatewayFacade(deps: GatewayFacadeDeps): GatewayFacade {
  const { sessions, channels, auth, cron, webhooks } = deps;
  let started = false;

  return {
    sessions,
    channels,
    auth,
    cron,
    webhooks,

    async start() {
      if (started) {
        return { channelsBooted: [], channelsFailed: [] };
      }
      const result = await channels.bootAll();
      started = true;
      return { channelsBooted: result.booted, channelsFailed: result.failed };
    },

    async stop() {
      if (!started) {
        return;
      }
      const sessionList = await sessions.list();
      for (const s of sessionList) {
        await sessions.stop(s.sessionId);
      }
      await channels.shutdownAll();
      started = false;
    },

    async status() {
      const [sessionList, channelList] = await Promise.all([sessions.list(), channels.list()]);
      return {
        sessions: sessionList,
        channels: channelList,
        cronJobs: cron.list(),
      };
    },
  };
}
