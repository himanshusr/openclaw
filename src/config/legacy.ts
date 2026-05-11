import type { LegacyConfigIssue } from "./types.js";
import { LEGACY_CONFIG_MIGRATIONS } from "./legacy.migrations.js";
import { LEGACY_CONFIG_RULES } from "./legacy.rules.js";
import { adaptLegacyMigration, runMigrations } from "./legacy.shared.js";

export function findLegacyConfigIssues(raw: unknown): LegacyConfigIssue[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const root = raw as Record<string, unknown>;
  const issues: LegacyConfigIssue[] = [];
  for (const rule of LEGACY_CONFIG_RULES) {
    let cursor: unknown = root;
    for (const key of rule.path) {
      if (!cursor || typeof cursor !== "object") {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    if (cursor !== undefined && (!rule.match || rule.match(cursor, root))) {
      issues.push({ path: rule.path.join("."), message: rule.message });
    }
  }
  return issues;
}

// 630:P3 Issue #65 -- precompute the adapted Command list once. Each
// LegacyConfigMigration becomes a MigrationCommand via adaptLegacyMigration.
const LEGACY_MIGRATION_COMMANDS = LEGACY_CONFIG_MIGRATIONS.map(adaptLegacyMigration);

export function applyLegacyMigrations(raw: unknown): {
  next: Record<string, unknown> | null;
  changes: string[];
} {
  // 630:P3 Issue #65 -- delegate to the Command-pattern Invoker. The
  // previous body inlined the clone, the loop, and the change-array
  // shepherding; runMigrations now owns all of that.
  return runMigrations(raw, LEGACY_MIGRATION_COMMANDS);
}
