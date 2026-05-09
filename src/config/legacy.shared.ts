export type LegacyConfigRule = {
  path: string[];
  message: string;
  match?: (value: unknown, root: Record<string, unknown>) => boolean;
};

export type LegacyConfigMigration = {
  id: string;
  describe: string;
  apply: (raw: Record<string, unknown>, changes: string[]) => void;
};

// 630:P3 Issue #65 -- Command pattern.
//
// A LegacyConfigMigration is conceptually a Command: it has an id
// (handle), a describe (human label), and an apply method that mutates
// the receiver (the raw config). Today, however, each migration writes
// its change descriptions into a shared `changes: string[]` passed by
// the runner -- the Spaghetti Code shape that #65 targets, because the
// "did this command apply anything?" signal is smeared across the
// callee mutating the caller's array.
//
// MigrationCommand is the typed Command interface. execute() takes a
// MigrationContext (per-invocation state, isolated to this command)
// and returns a structured MigrationResult that the Invoker aggregates.
// Adapters below let the Invoker run either an old-style
// LegacyConfigMigration or a new MigrationCommand uniformly, so the
// existing migration objects keep working unchanged. New migrations
// can be authored as MigrationCommands directly, which is what the
// follow-up consolidation (Section 7.3 of the Part-1 report) targets.

export type MigrationContext = {
  /** The mutable raw config the command may rewrite in place. */
  raw: Record<string, unknown>;
};

export type MigrationResult = {
  /** True iff the command actually mutated `raw`. */
  applied: boolean;
  /** Human-readable change descriptions to surface to the user. */
  changes: string[];
};

export type MigrationCommand = {
  id: string;
  describe: string;
  execute(ctx: MigrationContext): MigrationResult;
};

/**
 * Adapt a legacy { id, describe, apply } migration to the
 * MigrationCommand interface. apply() pushes its change descriptions
 * into a per-invocation array we own, so the Invoker can decide whether
 * the command did anything based on the array length.
 */
export function adaptLegacyMigration(legacy: LegacyConfigMigration): MigrationCommand {
  return {
    id: legacy.id,
    describe: legacy.describe,
    execute(ctx) {
      const changes: string[] = [];
      legacy.apply(ctx.raw, changes);
      return { applied: changes.length > 0, changes };
    },
  };
}

/**
 * Invoker: runs the given commands in order against a freshly cloned
 * copy of `raw`, aggregates their results, and returns the final
 * mutated config (or null if nothing changed).
 */
export function runMigrations(
  raw: unknown,
  commands: ReadonlyArray<MigrationCommand>,
): { next: Record<string, unknown> | null; changes: string[] } {
  if (!raw || typeof raw !== "object") {
    return { next: null, changes: [] };
  }
  const ctx: MigrationContext = {
    raw: structuredClone(raw) as Record<string, unknown>,
  };
  const allChanges: string[] = [];
  for (const command of commands) {
    const result = command.execute(ctx);
    if (result.applied) {
      allChanges.push(...result.changes);
    }
  }
  if (allChanges.length === 0) {
    return { next: null, changes: [] };
  }
  return { next: ctx.raw, changes: allChanges };
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const getRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

export const ensureRecord = (
  root: Record<string, unknown>,
  key: string,
): Record<string, unknown> => {
  const existing = root[key];
  if (isRecord(existing)) {
    return existing;
  }
  const next: Record<string, unknown> = {};
  root[key] = next;
  return next;
};

export const mergeMissing = (target: Record<string, unknown>, source: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    const existing = target[key];
    if (existing === undefined) {
      target[key] = value;
      continue;
    }
    if (isRecord(existing) && isRecord(value)) {
      mergeMissing(existing, value);
    }
  }
};

const AUDIO_TRANSCRIPTION_CLI_ALLOWLIST = new Set(["whisper"]);

export const mapLegacyAudioTranscription = (value: unknown): Record<string, unknown> | null => {
  const transcriber = getRecord(value);
  const command = Array.isArray(transcriber?.command) ? transcriber?.command : null;
  if (!command || command.length === 0) {
    return null;
  }
  const rawExecutable = String(command[0] ?? "").trim();
  if (!rawExecutable) {
    return null;
  }
  const executableName = rawExecutable.split(/[\\/]/).pop() ?? rawExecutable;
  if (!AUDIO_TRANSCRIPTION_CLI_ALLOWLIST.has(executableName)) {
    return null;
  }

  const args = command.slice(1).map((part) => String(part));
  const timeoutSeconds =
    typeof transcriber?.timeoutSeconds === "number" ? transcriber?.timeoutSeconds : undefined;

  const result: Record<string, unknown> = { command: rawExecutable, type: "cli" };
  if (args.length > 0) {
    result.args = args;
  }
  if (timeoutSeconds !== undefined) {
    result.timeoutSeconds = timeoutSeconds;
  }
  return result;
};

export const getAgentsList = (agents: Record<string, unknown> | null) => {
  const list = agents?.list;
  return Array.isArray(list) ? list : [];
};

export const resolveDefaultAgentIdFromRaw = (raw: Record<string, unknown>) => {
  const agents = getRecord(raw.agents);
  const list = getAgentsList(agents);
  const defaultEntry = list.find(
    (entry): entry is { id: string } =>
      isRecord(entry) &&
      entry.default === true &&
      typeof entry.id === "string" &&
      entry.id.trim() !== "",
  );
  if (defaultEntry) {
    return defaultEntry.id.trim();
  }
  const routing = getRecord(raw.routing);
  const routingDefault =
    typeof routing?.defaultAgentId === "string" ? routing.defaultAgentId.trim() : "";
  if (routingDefault) {
    return routingDefault;
  }
  const firstEntry = list.find(
    (entry): entry is { id: string } =>
      isRecord(entry) && typeof entry.id === "string" && entry.id.trim() !== "",
  );
  if (firstEntry) {
    return firstEntry.id.trim();
  }
  return "main";
};

export const ensureAgentEntry = (list: unknown[], id: string): Record<string, unknown> => {
  const normalized = id.trim();
  const existing = list.find(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) && typeof entry.id === "string" && entry.id.trim() === normalized,
  );
  if (existing) {
    return existing;
  }
  const created: Record<string, unknown> = { id: normalized };
  list.push(created);
  return created;
};
