import { randomUUID } from "node:crypto";
import type { ModelCatalogEntry } from "../agents/model-catalog.js";
import type { OpenClawConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveAllowedModelRef, resolveDefaultModelForAgent } from "../agents/model-selection.js";
import { normalizeGroupActivation } from "../auto-reply/group-activation.js";
import {
  formatThinkingLevels,
  formatXHighModelHint,
  normalizeElevatedLevel,
  normalizeReasoningLevel,
  normalizeThinkLevel,
  normalizeUsageDisplay,
  supportsXHighThinking,
} from "../auto-reply/thinking.js";
import {
  isSubagentSessionKey,
  normalizeAgentId,
  parseAgentSessionKey,
} from "../routing/session-key.js";
import { applyVerboseOverride, parseVerboseOverride } from "../sessions/level-overrides.js";
import { applyModelOverrideToSessionEntry } from "../sessions/model-overrides.js";
import { normalizeSendPolicy } from "../sessions/send-policy.js";
import { parseSessionLabel } from "../sessions/session-label.js";
import {
  ErrorCodes,
  type ErrorShape,
  errorShape,
  type SessionsPatchParams,
} from "./protocol/index.js";

function invalid(message: string): { ok: false; error: ErrorShape } {
  return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, message) };
}

function normalizeExecHost(raw: string): "sandbox" | "gateway" | "node" | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "sandbox" || normalized === "gateway" || normalized === "node") {
    return normalized;
  }
  return undefined;
}

function normalizeExecSecurity(raw: string): "deny" | "allowlist" | "full" | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "deny" || normalized === "allowlist" || normalized === "full") {
    return normalized;
  }
  return undefined;
}

function normalizeExecAsk(raw: string): "off" | "on-miss" | "always" | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "off" || normalized === "on-miss" || normalized === "always") {
    return normalized;
  }
  return undefined;
}

function applyNormalizedPatchField(
  entry: Record<string, unknown>,
  patch: Record<string, unknown>,
  field: string,
  normalize: (raw: string) => string | undefined,
  errorMsg: string,
  deleteOnValues?: string[],
): { ok: true } | { ok: false; error: ErrorShape } {
  if (!(field in patch)) return { ok: true };
  const raw = patch[field];
  if (raw === null) {
    delete entry[field];
    return { ok: true };
  }
  if (raw === undefined) return { ok: true };
  const normalized = normalize(String(raw));
  if (!normalized) return invalid(errorMsg);
  if (deleteOnValues?.includes(normalized)) {
    delete entry[field];
  } else {
    entry[field] = normalized;
  }
  return { ok: true };
}

export async function applySessionsPatchToStore(params: {
  cfg: OpenClawConfig;
  store: Record<string, SessionEntry>;
  storeKey: string;
  patch: SessionsPatchParams;
  loadGatewayModelCatalog?: () => Promise<ModelCatalogEntry[]>;
}): Promise<{ ok: true; entry: SessionEntry } | { ok: false; error: ErrorShape }> {
  const { cfg, store, storeKey, patch } = params;
  const now = Date.now();
  const parsedAgent = parseAgentSessionKey(storeKey);
  const sessionAgentId = normalizeAgentId(parsedAgent?.agentId ?? resolveDefaultAgentId(cfg));
  const resolvedDefault = resolveDefaultModelForAgent({ cfg, agentId: sessionAgentId });

  const existing = store[storeKey];
  const next: SessionEntry = existing
    ? {
        ...existing,
        updatedAt: Math.max(existing.updatedAt ?? 0, now),
      }
    : { sessionId: randomUUID(), updatedAt: now };

  const entryRec = next as unknown as Record<string, unknown>;
  const patchRec = patch as unknown as Record<string, unknown>;

  if ("spawnedBy" in patch) {
    const raw = patch.spawnedBy;
    if (raw === null) {
      if (existing?.spawnedBy) {
        return invalid("spawnedBy cannot be cleared once set");
      }
    } else if (raw !== undefined) {
      const trimmed = String(raw).trim();
      if (!trimmed) {
        return invalid("invalid spawnedBy: empty");
      }
      if (!isSubagentSessionKey(storeKey)) {
        return invalid("spawnedBy is only supported for subagent:* sessions");
      }
      if (existing?.spawnedBy && existing.spawnedBy !== trimmed) {
        return invalid("spawnedBy cannot be changed once set");
      }
      next.spawnedBy = trimmed;
    }
  }

  if ("label" in patch) {
    const raw = patch.label;
    if (raw === null) {
      delete next.label;
    } else if (raw !== undefined) {
      const parsed = parseSessionLabel(raw);
      if (!parsed.ok) {
        return invalid(parsed.error);
      }
      for (const [key, entry] of Object.entries(store)) {
        if (key === storeKey) {
          continue;
        }
        if (entry?.label === parsed.label) {
          return invalid(`label already in use: ${parsed.label}`);
        }
      }
      next.label = parsed.label;
    }
  }

  if ("thinkingLevel" in patch) {
    const raw = patch.thinkingLevel;
    if (raw === null) {
      delete next.thinkingLevel;
    } else if (raw !== undefined) {
      const normalized = normalizeThinkLevel(String(raw));
      if (!normalized) {
        const hintProvider = existing?.providerOverride?.trim() || resolvedDefault.provider;
        const hintModel = existing?.modelOverride?.trim() || resolvedDefault.model;
        return invalid(
          `invalid thinkingLevel (use ${formatThinkingLevels(hintProvider, hintModel, "|")})`,
        );
      }
      if (normalized === "off") {
        delete next.thinkingLevel;
      } else {
        next.thinkingLevel = normalized;
      }
    }
  }

  if ("verboseLevel" in patch) {
    const raw = patch.verboseLevel;
    const parsed = parseVerboseOverride(raw);
    if (!parsed.ok) {
      return invalid(parsed.error);
    }
    applyVerboseOverride(next, parsed.value);
  }

  {
    const r = applyNormalizedPatchField(entryRec, patchRec, "reasoningLevel",
      normalizeReasoningLevel, 'invalid reasoningLevel (use "on"|"off"|"stream")', ["off"]);
    if (!r.ok) return r;
  }

  {
    const r = applyNormalizedPatchField(entryRec, patchRec, "responseUsage",
      normalizeUsageDisplay, 'invalid responseUsage (use "off"|"tokens"|"full")', ["off"]);
    if (!r.ok) return r;
  }

  {
    const r = applyNormalizedPatchField(entryRec, patchRec, "elevatedLevel",
      normalizeElevatedLevel, 'invalid elevatedLevel (use "on"|"off"|"ask"|"full")');
    if (!r.ok) return r;
  }

  {
    const r = applyNormalizedPatchField(entryRec, patchRec, "execHost",
      normalizeExecHost, 'invalid execHost (use "sandbox"|"gateway"|"node")');
    if (!r.ok) return r;
  }

  {
    const r = applyNormalizedPatchField(entryRec, patchRec, "execSecurity",
      normalizeExecSecurity, 'invalid execSecurity (use "deny"|"allowlist"|"full")');
    if (!r.ok) return r;
  }

  {
    const r = applyNormalizedPatchField(entryRec, patchRec, "execAsk",
      normalizeExecAsk, 'invalid execAsk (use "off"|"on-miss"|"always")');
    if (!r.ok) return r;
  }

  if ("execNode" in patch) {
    const raw = patch.execNode;
    if (raw === null) {
      delete next.execNode;
    } else if (raw !== undefined) {
      const trimmed = String(raw).trim();
      if (!trimmed) {
        return invalid("invalid execNode: empty");
      }
      next.execNode = trimmed;
    }
  }

  if ("model" in patch) {
    const raw = patch.model;
    if (raw === null) {
      applyModelOverrideToSessionEntry({
        entry: next,
        selection: {
          provider: resolvedDefault.provider,
          model: resolvedDefault.model,
          isDefault: true,
        },
      });
    } else if (raw !== undefined) {
      const trimmed = String(raw).trim();
      if (!trimmed) {
        return invalid("invalid model: empty");
      }
      if (!params.loadGatewayModelCatalog) {
        return {
          ok: false,
          error: errorShape(ErrorCodes.UNAVAILABLE, "model catalog unavailable"),
        };
      }
      const catalog = await params.loadGatewayModelCatalog();
      const resolved = resolveAllowedModelRef({
        cfg,
        catalog,
        raw: trimmed,
        defaultProvider: resolvedDefault.provider,
        defaultModel: resolvedDefault.model,
      });
      if ("error" in resolved) {
        return invalid(resolved.error);
      }
      const isDefault =
        resolved.ref.provider === resolvedDefault.provider &&
        resolved.ref.model === resolvedDefault.model;
      applyModelOverrideToSessionEntry({
        entry: next,
        selection: {
          provider: resolved.ref.provider,
          model: resolved.ref.model,
          isDefault,
        },
      });
    }
  }

  if (next.thinkingLevel === "xhigh") {
    const effectiveProvider = next.providerOverride ?? resolvedDefault.provider;
    const effectiveModel = next.modelOverride ?? resolvedDefault.model;
    if (!supportsXHighThinking(effectiveProvider, effectiveModel)) {
      if ("thinkingLevel" in patch) {
        return invalid(`thinkingLevel "xhigh" is only supported for ${formatXHighModelHint()}`);
      }
      next.thinkingLevel = "high";
    }
  }

  {
    const r = applyNormalizedPatchField(entryRec, patchRec, "sendPolicy",
      normalizeSendPolicy, 'invalid sendPolicy (use "allow"|"deny")');
    if (!r.ok) return r;
  }

  {
    const r = applyNormalizedPatchField(entryRec, patchRec, "groupActivation",
      normalizeGroupActivation, 'invalid groupActivation (use "mention"|"always")');
    if (!r.ok) return r;
  }

  store[storeKey] = next;
  return { ok: true, entry: next };
}
