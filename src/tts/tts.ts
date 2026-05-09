import { completeSimple, type TextContent } from "@mariozechner/pi-ai";
import { EdgeTTS } from "node-edge-tts";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ReplyPayload } from "../auto-reply/types.js";
import type { ChannelId } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import type {
  TtsConfig,
  TtsAutoMode,
  TtsMode,
  TtsProvider,
  TtsModelOverrideConfig,
} from "../config/types.tts.js";
import { getApiKeyForModel, requireApiKey } from "../agents/model-auth.js";
import {
  buildModelAliasIndex,
  resolveDefaultModelForAgent,
  resolveModelRefFromString,
  type ModelRef,
} from "../agents/model-selection.js";
import { resolveModel } from "../agents/pi-embedded-runner/model.js";
import { normalizeChannelId } from "../channels/plugins/index.js";
import { logVerbose } from "../globals.js";
import { isVoiceCompatibleAudio } from "../media/audio.js";
import { CONFIG_DIR, resolveUserPath } from "../utils.js";
import { elevenLabsTTS, isValidVoiceId } from "./elevenlabs.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TTS_MAX_LENGTH = 1500;
const DEFAULT_TTS_SUMMARIZE = true;
const DEFAULT_MAX_TEXT_LENGTH = 4096;
const TEMP_FILE_CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes

const DEFAULT_ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_ELEVENLABS_VOICE_ID = "pMsXgVXv3BLzUgSXRplE";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-tts";
const DEFAULT_OPENAI_VOICE = "alloy";
const DEFAULT_EDGE_VOICE = "en-US-MichelleNeural";
const DEFAULT_EDGE_LANG = "en-US";
const DEFAULT_EDGE_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

const DEFAULT_ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.0,
  useSpeakerBoost: true,
  speed: 1.0,
};

const TELEGRAM_OUTPUT = {
  openai: "opus" as const,
  // ElevenLabs output formats use codec_sample_rate_bitrate naming.
  // Opus @ 48kHz/64kbps is a good voice-note tradeoff for Telegram.
  elevenlabs: "opus_48000_64",
  extension: ".opus",
  voiceCompatible: true,
};

const DEFAULT_OUTPUT = {
  openai: "mp3" as const,
  elevenlabs: "mp3_44100_128",
  extension: ".mp3",
  voiceCompatible: false,
};

const TELEPHONY_OUTPUT = {
  openai: { format: "pcm" as const, sampleRate: 24000 },
  elevenlabs: { format: "pcm_22050", sampleRate: 22050 },
};

const TTS_AUTO_MODES = new Set<TtsAutoMode>(["off", "always", "inbound", "tagged"]);

export type ResolvedTtsConfig = {
  auto: TtsAutoMode;
  mode: TtsMode;
  provider: TtsProvider;
  providerSource: "config" | "default";
  summaryModel?: string;
  modelOverrides: ResolvedTtsModelOverrides;
  elevenlabs: {
    apiKey?: string;
    baseUrl: string;
    voiceId: string;
    modelId: string;
    seed?: number;
    applyTextNormalization?: "auto" | "on" | "off";
    languageCode?: string;
    voiceSettings: {
      stability: number;
      similarityBoost: number;
      style: number;
      useSpeakerBoost: boolean;
      speed: number;
    };
  };
  openai: {
    apiKey?: string;
    model: string;
    voice: string;
  };
  edge: {
    enabled: boolean;
    voice: string;
    lang: string;
    outputFormat: string;
    outputFormatConfigured: boolean;
    pitch?: string;
    rate?: string;
    volume?: string;
    saveSubtitles: boolean;
    proxy?: string;
    timeoutMs?: number;
  };
  prefsPath?: string;
  maxTextLength: number;
  timeoutMs: number;
};

type TtsUserPrefs = {
  tts?: {
    auto?: TtsAutoMode;
    enabled?: boolean;
    provider?: TtsProvider;
    maxLength?: number;
    summarize?: boolean;
  };
};

type ResolvedTtsModelOverrides = {
  enabled: boolean;
  allowText: boolean;
  allowProvider: boolean;
  allowVoice: boolean;
  allowModelId: boolean;
  allowVoiceSettings: boolean;
  allowNormalization: boolean;
  allowSeed: boolean;
};

type TtsDirectiveOverrides = {
  ttsText?: string;
  provider?: TtsProvider;
  openai?: {
    voice?: string;
    model?: string;
  };
  elevenlabs?: {
    voiceId?: string;
    modelId?: string;
    seed?: number;
    applyTextNormalization?: "auto" | "on" | "off";
    languageCode?: string;
    voiceSettings?: Partial<ResolvedTtsConfig["elevenlabs"]["voiceSettings"]>;
  };
};

type TtsDirectiveParseResult = {
  cleanedText: string;
  ttsText?: string;
  hasDirective: boolean;
  overrides: TtsDirectiveOverrides;
  warnings: string[];
};

export type TtsResult = {
  success: boolean;
  audioPath?: string;
  error?: string;
  latencyMs?: number;
  provider?: string;
  outputFormat?: string;
  voiceCompatible?: boolean;
};

export type TtsTelephonyResult = {
  success: boolean;
  audioBuffer?: Buffer;
  error?: string;
  latencyMs?: number;
  provider?: string;
  outputFormat?: string;
  sampleRate?: number;
};

type TtsStatusEntry = {
  timestamp: number;
  success: boolean;
  textLength: number;
  summarized: boolean;
  provider?: string;
  latencyMs?: number;
  error?: string;
};

let lastTtsAttempt: TtsStatusEntry | undefined;

export function normalizeTtsAutoMode(value: unknown): TtsAutoMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (TTS_AUTO_MODES.has(normalized as TtsAutoMode)) {
    return normalized as TtsAutoMode;
  }
  return undefined;
}

function resolveModelOverridePolicy(
  overrides: TtsModelOverrideConfig | undefined,
): ResolvedTtsModelOverrides {
  const enabled = overrides?.enabled ?? true;
  if (!enabled) {
    return {
      enabled: false,
      allowText: false,
      allowProvider: false,
      allowVoice: false,
      allowModelId: false,
      allowVoiceSettings: false,
      allowNormalization: false,
      allowSeed: false,
    };
  }
  const allow = (value?: boolean) => value ?? true;
  return {
    enabled: true,
    allowText: allow(overrides?.allowText),
    allowProvider: allow(overrides?.allowProvider),
    allowVoice: allow(overrides?.allowVoice),
    allowModelId: allow(overrides?.allowModelId),
    allowVoiceSettings: allow(overrides?.allowVoiceSettings),
    allowNormalization: allow(overrides?.allowNormalization),
    allowSeed: allow(overrides?.allowSeed),
  };
}

export function resolveTtsConfig(cfg: OpenClawConfig): ResolvedTtsConfig {
  const raw: TtsConfig = cfg.messages?.tts ?? {};
  const providerSource = raw.provider ? "config" : "default";
  const edgeOutputFormat = raw.edge?.outputFormat?.trim();
  const auto = normalizeTtsAutoMode(raw.auto) ?? (raw.enabled ? "always" : "off");
  return {
    auto,
    mode: raw.mode ?? "final",
    provider: raw.provider ?? "edge",
    providerSource,
    summaryModel: raw.summaryModel?.trim() || undefined,
    modelOverrides: resolveModelOverridePolicy(raw.modelOverrides),
    elevenlabs: {
      apiKey: raw.elevenlabs?.apiKey,
      baseUrl: raw.elevenlabs?.baseUrl?.trim() || DEFAULT_ELEVENLABS_BASE_URL,
      voiceId: raw.elevenlabs?.voiceId ?? DEFAULT_ELEVENLABS_VOICE_ID,
      modelId: raw.elevenlabs?.modelId ?? DEFAULT_ELEVENLABS_MODEL_ID,
      seed: raw.elevenlabs?.seed,
      applyTextNormalization: raw.elevenlabs?.applyTextNormalization,
      languageCode: raw.elevenlabs?.languageCode,
      voiceSettings: {
        stability:
          raw.elevenlabs?.voiceSettings?.stability ?? DEFAULT_ELEVENLABS_VOICE_SETTINGS.stability,
        similarityBoost:
          raw.elevenlabs?.voiceSettings?.similarityBoost ??
          DEFAULT_ELEVENLABS_VOICE_SETTINGS.similarityBoost,
        style: raw.elevenlabs?.voiceSettings?.style ?? DEFAULT_ELEVENLABS_VOICE_SETTINGS.style,
        useSpeakerBoost:
          raw.elevenlabs?.voiceSettings?.useSpeakerBoost ??
          DEFAULT_ELEVENLABS_VOICE_SETTINGS.useSpeakerBoost,
        speed: raw.elevenlabs?.voiceSettings?.speed ?? DEFAULT_ELEVENLABS_VOICE_SETTINGS.speed,
      },
    },
    openai: {
      apiKey: raw.openai?.apiKey,
      model: raw.openai?.model ?? DEFAULT_OPENAI_MODEL,
      voice: raw.openai?.voice ?? DEFAULT_OPENAI_VOICE,
    },
    edge: {
      enabled: raw.edge?.enabled ?? true,
      voice: raw.edge?.voice?.trim() || DEFAULT_EDGE_VOICE,
      lang: raw.edge?.lang?.trim() || DEFAULT_EDGE_LANG,
      outputFormat: edgeOutputFormat || DEFAULT_EDGE_OUTPUT_FORMAT,
      outputFormatConfigured: Boolean(edgeOutputFormat),
      pitch: raw.edge?.pitch?.trim() || undefined,
      rate: raw.edge?.rate?.trim() || undefined,
      volume: raw.edge?.volume?.trim() || undefined,
      saveSubtitles: raw.edge?.saveSubtitles ?? false,
      proxy: raw.edge?.proxy?.trim() || undefined,
      timeoutMs: raw.edge?.timeoutMs,
    },
    prefsPath: raw.prefsPath,
    maxTextLength: raw.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH,
    timeoutMs: raw.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

export function resolveTtsPrefsPath(config: ResolvedTtsConfig): string {
  if (config.prefsPath?.trim()) {
    return resolveUserPath(config.prefsPath.trim());
  }
  const envPath = process.env.OPENCLAW_TTS_PREFS?.trim();
  if (envPath) {
    return resolveUserPath(envPath);
  }
  return path.join(CONFIG_DIR, "settings", "tts.json");
}

function resolveTtsAutoModeFromPrefs(prefs: TtsUserPrefs): TtsAutoMode | undefined {
  const auto = normalizeTtsAutoMode(prefs.tts?.auto);
  if (auto) {
    return auto;
  }
  if (typeof prefs.tts?.enabled === "boolean") {
    return prefs.tts.enabled ? "always" : "off";
  }
  return undefined;
}

export function resolveTtsAutoMode(params: {
  config: ResolvedTtsConfig;
  prefsPath: string;
  sessionAuto?: string;
}): TtsAutoMode {
  const sessionAuto = normalizeTtsAutoMode(params.sessionAuto);
  if (sessionAuto) {
    return sessionAuto;
  }
  const prefsAuto = resolveTtsAutoModeFromPrefs(readPrefs(params.prefsPath));
  if (prefsAuto) {
    return prefsAuto;
  }
  return params.config.auto;
}

export function buildTtsSystemPromptHint(cfg: OpenClawConfig): string | undefined {
  const config = resolveTtsConfig(cfg);
  const prefsPath = resolveTtsPrefsPath(config);
  const autoMode = resolveTtsAutoMode({ config, prefsPath });
  if (autoMode === "off") {
    return undefined;
  }
  const maxLength = getTtsMaxLength(prefsPath);
  const summarize = isSummarizationEnabled(prefsPath) ? "on" : "off";
  const autoHint =
    autoMode === "inbound"
      ? "Only use TTS when the user's last message includes audio/voice."
      : autoMode === "tagged"
        ? "Only use TTS when you include [[tts]] or [[tts:text]] tags."
        : undefined;
  return [
    "Voice (TTS) is enabled.",
    autoHint,
    `Keep spoken text ≤${maxLength} chars to avoid auto-summary (summary ${summarize}).`,
    "Use [[tts:...]] and optional [[tts:text]]...[[/tts:text]] to control voice/expressiveness.",
  ]
    .filter(Boolean)
    .join("\n");
}

function readPrefs(prefsPath: string): TtsUserPrefs {
  try {
    if (!existsSync(prefsPath)) {
      return {};
    }
    return JSON.parse(readFileSync(prefsPath, "utf8")) as TtsUserPrefs;
  } catch {
    return {};
  }
}

function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmpPath, content);
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    throw err;
  }
}

function updatePrefs(prefsPath: string, update: (prefs: TtsUserPrefs) => void): void {
  const prefs = readPrefs(prefsPath);
  update(prefs);
  mkdirSync(path.dirname(prefsPath), { recursive: true });
  atomicWriteFileSync(prefsPath, JSON.stringify(prefs, null, 2));
}

export function isTtsEnabled(
  config: ResolvedTtsConfig,
  prefsPath: string,
  sessionAuto?: string,
): boolean {
  return resolveTtsAutoMode({ config, prefsPath, sessionAuto }) !== "off";
}

export function setTtsAutoMode(prefsPath: string, mode: TtsAutoMode): void {
  updatePrefs(prefsPath, (prefs) => {
    const next = { ...prefs.tts };
    delete next.enabled;
    next.auto = mode;
    prefs.tts = next;
  });
}

export function setTtsEnabled(prefsPath: string, enabled: boolean): void {
  setTtsAutoMode(prefsPath, enabled ? "always" : "off");
}

export function getTtsProvider(config: ResolvedTtsConfig, prefsPath: string): TtsProvider {
  const prefs = readPrefs(prefsPath);
  if (prefs.tts?.provider) {
    return prefs.tts.provider;
  }
  if (config.providerSource === "config") {
    return config.provider;
  }

  if (resolveTtsApiKey(config, "openai")) {
    return "openai";
  }
  if (resolveTtsApiKey(config, "elevenlabs")) {
    return "elevenlabs";
  }
  return "edge";
}

export function setTtsProvider(prefsPath: string, provider: TtsProvider): void {
  updatePrefs(prefsPath, (prefs) => {
    prefs.tts = { ...prefs.tts, provider };
  });
}

export function getTtsMaxLength(prefsPath: string): number {
  const prefs = readPrefs(prefsPath);
  return prefs.tts?.maxLength ?? DEFAULT_TTS_MAX_LENGTH;
}

export function setTtsMaxLength(prefsPath: string, maxLength: number): void {
  updatePrefs(prefsPath, (prefs) => {
    prefs.tts = { ...prefs.tts, maxLength };
  });
}

export function isSummarizationEnabled(prefsPath: string): boolean {
  const prefs = readPrefs(prefsPath);
  return prefs.tts?.summarize ?? DEFAULT_TTS_SUMMARIZE;
}

export function setSummarizationEnabled(prefsPath: string, enabled: boolean): void {
  updatePrefs(prefsPath, (prefs) => {
    prefs.tts = { ...prefs.tts, summarize: enabled };
  });
}

export function getLastTtsAttempt(): TtsStatusEntry | undefined {
  return lastTtsAttempt;
}

export function setLastTtsAttempt(entry: TtsStatusEntry | undefined): void {
  lastTtsAttempt = entry;
}

function resolveOutputFormat(channelId?: string | null) {
  if (channelId === "telegram") {
    return TELEGRAM_OUTPUT;
  }
  return DEFAULT_OUTPUT;
}

function resolveChannelId(channel: string | undefined): ChannelId | null {
  return channel ? normalizeChannelId(channel) : null;
}

function resolveEdgeOutputFormat(config: ResolvedTtsConfig): string {
  return config.edge.outputFormat;
}

export function resolveTtsApiKey(
  config: ResolvedTtsConfig,
  provider: TtsProvider,
): string | undefined {
  if (provider === "elevenlabs") {
    return config.elevenlabs.apiKey || process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
  }
  if (provider === "openai") {
    return config.openai.apiKey || process.env.OPENAI_API_KEY;
  }
  return undefined;
}

export const TTS_PROVIDERS = ["openai", "elevenlabs", "edge"] as const;

export function resolveTtsProviderOrder(primary: TtsProvider): TtsProvider[] {
  return [primary, ...TTS_PROVIDERS.filter((provider) => provider !== primary)];
}

export function isTtsProviderConfigured(config: ResolvedTtsConfig, provider: TtsProvider): boolean {
  if (provider === "edge") {
    return config.edge.enabled;
  }
  return Boolean(resolveTtsApiKey(config, provider));
}

function parseBooleanValue(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseNumberValue(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTtsDirectives(
  text: string,
  policy: ResolvedTtsModelOverrides,
): TtsDirectiveParseResult {
  if (!policy.enabled) {
    return { cleanedText: text, overrides: {}, warnings: [], hasDirective: false };
  }

  const overrides: TtsDirectiveOverrides = {};
  const warnings: string[] = [];
  let cleanedText = text;
  let hasDirective = false;

  const blockRegex = /\[\[tts:text\]\]([\s\S]*?)\[\[\/tts:text\]\]/gi;
  cleanedText = cleanedText.replace(blockRegex, (_match, inner: string) => {
    hasDirective = true;
    if (policy.allowText && overrides.ttsText == null) {
      overrides.ttsText = inner.trim();
    }
    return "";
  });

  const directiveRegex = /\[\[tts:([^\]]+)\]\]/gi;
  cleanedText = cleanedText.replace(directiveRegex, (_match, body: string) => {
    hasDirective = true;
    const tokens = body.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const eqIndex = token.indexOf("=");
      if (eqIndex === -1) {
        continue;
      }
      const rawKey = token.slice(0, eqIndex).trim();
      const rawValue = token.slice(eqIndex + 1).trim();
      if (!rawKey || !rawValue) {
        continue;
      }
      const key = rawKey.toLowerCase();
      try {
        switch (key) {
          case "provider":
            if (!policy.allowProvider) {
              break;
            }
            if (rawValue === "openai" || rawValue === "elevenlabs" || rawValue === "edge") {
              overrides.provider = rawValue;
            } else {
              warnings.push(`unsupported provider "${rawValue}"`);
            }
            break;
          case "voice":
          case "openai_voice":
          case "openaivoice":
            if (!policy.allowVoice) {
              break;
            }
            if (isValidOpenAIVoice(rawValue)) {
              overrides.openai = { ...overrides.openai, voice: rawValue };
            } else {
              warnings.push(`invalid OpenAI voice "${rawValue}"`);
            }
            break;
          case "voiceid":
          case "voice_id":
          case "elevenlabs_voice":
          case "elevenlabsvoice":
            if (!policy.allowVoice) {
              break;
            }
            if (isValidVoiceId(rawValue)) {
              overrides.elevenlabs = { ...overrides.elevenlabs, voiceId: rawValue };
            } else {
              warnings.push(`invalid ElevenLabs voiceId "${rawValue}"`);
            }
            break;
          case "model":
          case "modelid":
          case "model_id":
          case "elevenlabs_model":
          case "elevenlabsmodel":
          case "openai_model":
          case "openaimodel":
            if (!policy.allowModelId) {
              break;
            }
            if (isValidOpenAIModel(rawValue)) {
              overrides.openai = { ...overrides.openai, model: rawValue };
            } else {
              overrides.elevenlabs = { ...overrides.elevenlabs, modelId: rawValue };
            }
            break;
          case "stability":
            if (!policy.allowVoiceSettings) {
              break;
            }
            {
              const value = parseNumberValue(rawValue);
              if (value == null) {
                warnings.push("invalid stability value");
                break;
              }
              requireInRange(value, 0, 1, "stability");
              overrides.elevenlabs = {
                ...overrides.elevenlabs,
                voiceSettings: { ...overrides.elevenlabs?.voiceSettings, stability: value },
              };
            }
            break;
          case "similarity":
          case "similarityboost":
          case "similarity_boost":
            if (!policy.allowVoiceSettings) {
              break;
            }
            {
              const value = parseNumberValue(rawValue);
              if (value == null) {
                warnings.push("invalid similarityBoost value");
                break;
              }
              requireInRange(value, 0, 1, "similarityBoost");
              overrides.elevenlabs = {
                ...overrides.elevenlabs,
                voiceSettings: { ...overrides.elevenlabs?.voiceSettings, similarityBoost: value },
              };
            }
            break;
          case "style":
            if (!policy.allowVoiceSettings) {
              break;
            }
            {
              const value = parseNumberValue(rawValue);
              if (value == null) {
                warnings.push("invalid style value");
                break;
              }
              requireInRange(value, 0, 1, "style");
              overrides.elevenlabs = {
                ...overrides.elevenlabs,
                voiceSettings: { ...overrides.elevenlabs?.voiceSettings, style: value },
              };
            }
            break;
          case "speed":
            if (!policy.allowVoiceSettings) {
              break;
            }
            {
              const value = parseNumberValue(rawValue);
              if (value == null) {
                warnings.push("invalid speed value");
                break;
              }
              requireInRange(value, 0.5, 2, "speed");
              overrides.elevenlabs = {
                ...overrides.elevenlabs,
                voiceSettings: { ...overrides.elevenlabs?.voiceSettings, speed: value },
              };
            }
            break;
          case "speakerboost":
          case "speaker_boost":
          case "usespeakerboost":
          case "use_speaker_boost":
            if (!policy.allowVoiceSettings) {
              break;
            }
            {
              const value = parseBooleanValue(rawValue);
              if (value == null) {
                warnings.push("invalid useSpeakerBoost value");
                break;
              }
              overrides.elevenlabs = {
                ...overrides.elevenlabs,
                voiceSettings: { ...overrides.elevenlabs?.voiceSettings, useSpeakerBoost: value },
              };
            }
            break;
          case "normalize":
          case "applytextnormalization":
          case "apply_text_normalization":
            if (!policy.allowNormalization) {
              break;
            }
            overrides.elevenlabs = {
              ...overrides.elevenlabs,
              applyTextNormalization: normalizeApplyTextNormalization(rawValue),
            };
            break;
          case "language":
          case "languagecode":
          case "language_code":
            if (!policy.allowNormalization) {
              break;
            }
            overrides.elevenlabs = {
              ...overrides.elevenlabs,
              languageCode: normalizeLanguageCode(rawValue),
            };
            break;
          case "seed":
            if (!policy.allowSeed) {
              break;
            }
            overrides.elevenlabs = {
              ...overrides.elevenlabs,
              seed: normalizeSeed(Number.parseInt(rawValue, 10)),
            };
            break;
          default:
            break;
        }
      } catch (err) {
        warnings.push((err as Error).message);
      }
    }
    return "";
  });

  return {
    cleanedText,
    ttsText: overrides.ttsText,
    hasDirective,
    overrides,
    warnings,
  };
}

export const OPENAI_TTS_MODELS = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"] as const;

/**
 * Custom OpenAI-compatible TTS endpoint.
 * When set, model/voice validation is relaxed to allow non-OpenAI models.
 * Example: OPENAI_TTS_BASE_URL=http://localhost:8880/v1
 *
 * Note: Read at runtime (not module load) to support config.env loading.
 */
function getOpenAITtsBaseUrl(): string {
  return (process.env.OPENAI_TTS_BASE_URL?.trim() || "https://api.openai.com/v1").replace(
    /\/+$/,
    "",
  );
}

function isCustomOpenAIEndpoint(): boolean {
  return getOpenAITtsBaseUrl() !== "https://api.openai.com/v1";
}
export const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
] as const;

type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];

function isValidOpenAIModel(model: string): boolean {
  // Allow any model when using custom endpoint (e.g., Kokoro, LocalAI)
  if (isCustomOpenAIEndpoint()) {
    return true;
  }
  return OPENAI_TTS_MODELS.includes(model as (typeof OPENAI_TTS_MODELS)[number]);
}

function isValidOpenAIVoice(voice: string): voice is OpenAiTtsVoice {
  // Allow any voice when using custom endpoint (e.g., Kokoro Chinese voices)
  if (isCustomOpenAIEndpoint()) {
    return true;
  }
  return OPENAI_TTS_VOICES.includes(voice as OpenAiTtsVoice);
}

type SummarizeResult = {
  summary: string;
  latencyMs: number;
  inputLength: number;
  outputLength: number;
};

type SummaryModelSelection = {
  ref: ModelRef;
  source: "summaryModel" | "default";
};

function resolveSummaryModelRef(
  cfg: OpenClawConfig,
  config: ResolvedTtsConfig,
): SummaryModelSelection {
  const defaultRef = resolveDefaultModelForAgent({ cfg });
  const override = config.summaryModel?.trim();
  if (!override) {
    return { ref: defaultRef, source: "default" };
  }

  const aliasIndex = buildModelAliasIndex({ cfg, defaultProvider: defaultRef.provider });
  const resolved = resolveModelRefFromString({
    raw: override,
    defaultProvider: defaultRef.provider,
    aliasIndex,
  });
  if (!resolved) {
    return { ref: defaultRef, source: "default" };
  }
  return { ref: resolved.ref, source: "summaryModel" };
}

function isTextContentBlock(block: { type: string }): block is TextContent {
  return block.type === "text";
}

async function summarizeText(params: {
  text: string;
  targetLength: number;
  cfg: OpenClawConfig;
  config: ResolvedTtsConfig;
  timeoutMs: number;
}): Promise<SummarizeResult> {
  const { text, targetLength, cfg, config, timeoutMs } = params;
  if (targetLength < 100 || targetLength > 10_000) {
    throw new Error(`Invalid targetLength: ${targetLength}`);
  }

  const startTime = Date.now();
  const { ref } = resolveSummaryModelRef(cfg, config);
  const resolved = resolveModel(ref.provider, ref.model, undefined, cfg);
  if (!resolved.model) {
    throw new Error(resolved.error ?? `Unknown summary model: ${ref.provider}/${ref.model}`);
  }
  const apiKey = requireApiKey(
    await getApiKeyForModel({ model: resolved.model, cfg }),
    ref.provider,
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await completeSimple(
        resolved.model,
        {
          messages: [
            {
              role: "user",
              content:
                `You are an assistant that summarizes texts concisely while keeping the most important information. ` +
                `Summarize the text to approximately ${targetLength} characters. Maintain the original tone and style. ` +
                `Reply only with the summary, without additional explanations.\n\n` +
                `<text_to_summarize>\n${text}\n</text_to_summarize>`,
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey,
          maxTokens: Math.ceil(targetLength / 2),
          temperature: 0.3,
          signal: controller.signal,
        },
      );

      const summary = res.content
        .filter(isTextContentBlock)
        .map((block) => block.text.trim())
        .filter(Boolean)
        .join(" ")
        .trim();

      if (!summary) {
        throw new Error("No summary returned");
      }

      return {
        summary,
        latencyMs: Date.now() - startTime,
        inputLength: text.length,
        outputLength: summary.length,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const error = err as Error;
    if (error.name === "AbortError") {
      throw new Error("Summarization timed out", { cause: err });
    }
    throw err;
  }
}

function scheduleCleanup(tempDir: string, delayMs: number = TEMP_FILE_CLEANUP_DELAY_MS): void {
  const timer = setTimeout(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }, delayMs);
  timer.unref();
}

async function openaiTTS(params: {
  text: string;
  apiKey: string;
  model: string;
  voice: string;
  responseFormat: "mp3" | "opus" | "pcm";
  timeoutMs: number;
}): Promise<Buffer> {
  const { text, apiKey, model, voice, responseFormat, timeoutMs } = params;

  if (!isValidOpenAIModel(model)) {
    throw new Error(`Invalid model: ${model}`);
  }
  if (!isValidOpenAIVoice(voice)) {
    throw new Error(`Invalid voice: ${voice}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getOpenAITtsBaseUrl()}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: responseFormat,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI TTS API error (${response.status})`);
    }

    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

function inferEdgeExtension(outputFormat: string): string {
  const normalized = outputFormat.toLowerCase();
  if (normalized.includes("webm")) {
    return ".webm";
  }
  if (normalized.includes("ogg")) {
    return ".ogg";
  }
  if (normalized.includes("opus")) {
    return ".opus";
  }
  if (normalized.includes("wav") || normalized.includes("riff") || normalized.includes("pcm")) {
    return ".wav";
  }
  return ".mp3";
}

async function edgeTTS(params: {
  text: string;
  outputPath: string;
  config: ResolvedTtsConfig["edge"];
  timeoutMs: number;
}): Promise<void> {
  const { text, outputPath, config, timeoutMs } = params;
  const tts = new EdgeTTS({
    voice: config.voice,
    lang: config.lang,
    outputFormat: config.outputFormat,
    saveSubtitles: config.saveSubtitles,
    proxy: config.proxy,
    rate: config.rate,
    pitch: config.pitch,
    volume: config.volume,
    timeout: config.timeoutMs ?? timeoutMs,
  });
  await tts.ttsPromise(text, outputPath);
}

// ===========================================================================
// 630:P3 Issue #60 -- Factory Method for TTS provider dispatch.
//
// Both textToSpeech and textToSpeechTelephony used to repeat the same
// per-provider if/else ladder. The Factory Method pattern below replaces
// each ladder with a typed dispatch table that returns the right
// per-provider synthesizer function. Adding a new provider is now one
// new entry per factory rather than two near-identical edits across the
// two top-level loops. Edge stays inline in textToSpeech because it has
// special file-output semantics (writes audio to a temp dir directly,
// rather than returning a Buffer).
// ===========================================================================

type TtsBufferContext = {
  text: string;
  apiKey: string;
  config: ResolvedTtsConfig;
  output: ReturnType<typeof resolveOutputFormat>;
  overrides?: TtsDirectiveOverrides;
};

type TtsBufferSynthesizer = (ctx: TtsBufferContext) => Promise<Buffer>;

// Factory entries: typed map keyed by provider name. The map IS the
// factory -- adding a new buffer-style provider means appending one
// entry, with no dispatch-side edits needed.
const TTS_BUFFER_FACTORIES: Partial<Record<TtsProvider, TtsBufferSynthesizer>> = {
  elevenlabs: async ({ text, apiKey, config, output, overrides }) => {
    const elevenOverrides = overrides?.elevenlabs;
    const voiceSettings = {
      ...config.elevenlabs.voiceSettings,
      ...elevenOverrides?.voiceSettings,
    };
    return elevenLabsTTS({
      text,
      apiKey,
      baseUrl: config.elevenlabs.baseUrl,
      voiceId: elevenOverrides?.voiceId ?? config.elevenlabs.voiceId,
      modelId: elevenOverrides?.modelId ?? config.elevenlabs.modelId,
      outputFormat: output.elevenlabs,
      seed: elevenOverrides?.seed ?? config.elevenlabs.seed,
      applyTextNormalization:
        elevenOverrides?.applyTextNormalization ?? config.elevenlabs.applyTextNormalization,
      languageCode: elevenOverrides?.languageCode ?? config.elevenlabs.languageCode,
      voiceSettings,
      timeoutMs: config.timeoutMs,
    });
  },
  openai: async ({ text, apiKey, config, output, overrides }) =>
    openaiTTS({
      text,
      apiKey,
      model: overrides?.openai?.model ?? config.openai.model,
      voice: overrides?.openai?.voice ?? config.openai.voice,
      responseFormat: output.openai,
      timeoutMs: config.timeoutMs,
    }),
};

/** Factory Method entry point for buffer-returning providers. */
function createTtsBufferSynthesizer(provider: TtsProvider): TtsBufferSynthesizer | null {
  return TTS_BUFFER_FACTORIES[provider] ?? null;
}

type TtsTelephonyContext = {
  text: string;
  apiKey: string;
  config: ResolvedTtsConfig;
};

type TtsTelephonyResultPart = { buffer: Buffer; outputFormat: string; sampleRate: number };

type TtsTelephonySynthesizer = (ctx: TtsTelephonyContext) => Promise<TtsTelephonyResultPart>;

const TTS_TELEPHONY_FACTORIES: Partial<Record<TtsProvider, TtsTelephonySynthesizer>> = {
  elevenlabs: async ({ text, apiKey, config }) => {
    const output = TELEPHONY_OUTPUT.elevenlabs;
    const buffer = await elevenLabsTTS({
      text,
      apiKey,
      baseUrl: config.elevenlabs.baseUrl,
      voiceId: config.elevenlabs.voiceId,
      modelId: config.elevenlabs.modelId,
      outputFormat: output.format,
      seed: config.elevenlabs.seed,
      applyTextNormalization: config.elevenlabs.applyTextNormalization,
      languageCode: config.elevenlabs.languageCode,
      voiceSettings: config.elevenlabs.voiceSettings,
      timeoutMs: config.timeoutMs,
    });
    return { buffer, outputFormat: output.format, sampleRate: output.sampleRate };
  },
  openai: async ({ text, apiKey, config }) => {
    const output = TELEPHONY_OUTPUT.openai;
    const buffer = await openaiTTS({
      text,
      apiKey,
      model: config.openai.model,
      voice: config.openai.voice,
      responseFormat: output.format,
      timeoutMs: config.timeoutMs,
    });
    return { buffer, outputFormat: output.format, sampleRate: output.sampleRate };
  },
};

/** Factory Method entry point for telephony providers. */
function createTtsTelephonySynthesizer(provider: TtsProvider): TtsTelephonySynthesizer | null {
  return TTS_TELEPHONY_FACTORIES[provider] ?? null;
}

export async function textToSpeech(params: {
  text: string;
  cfg: OpenClawConfig;
  prefsPath?: string;
  channel?: string;
  overrides?: TtsDirectiveOverrides;
}): Promise<TtsResult> {
  const config = resolveTtsConfig(params.cfg);
  const prefsPath = params.prefsPath ?? resolveTtsPrefsPath(config);
  const channelId = resolveChannelId(params.channel);
  const output = resolveOutputFormat(channelId);

  if (params.text.length > config.maxTextLength) {
    return {
      success: false,
      error: `Text too long (${params.text.length} chars, max ${config.maxTextLength})`,
    };
  }

  const userProvider = getTtsProvider(config, prefsPath);
  const overrideProvider = params.overrides?.provider;
  const provider = overrideProvider ?? userProvider;
  const providers = resolveTtsProviderOrder(provider);

  let lastError: string | undefined;

  for (const provider of providers) {
    const providerStart = Date.now();
    try {
      if (provider === "edge") {
        if (!config.edge.enabled) {
          lastError = "edge: disabled";
          continue;
        }

        const tempDir = mkdtempSync(path.join(tmpdir(), "tts-"));
        let edgeOutputFormat = resolveEdgeOutputFormat(config);
        const fallbackEdgeOutputFormat =
          edgeOutputFormat !== DEFAULT_EDGE_OUTPUT_FORMAT ? DEFAULT_EDGE_OUTPUT_FORMAT : undefined;

        const attemptEdgeTts = async (outputFormat: string) => {
          const extension = inferEdgeExtension(outputFormat);
          const audioPath = path.join(tempDir, `voice-${Date.now()}${extension}`);
          await edgeTTS({
            text: params.text,
            outputPath: audioPath,
            config: {
              ...config.edge,
              outputFormat,
            },
            timeoutMs: config.timeoutMs,
          });
          return { audioPath, outputFormat };
        };

        let edgeResult: { audioPath: string; outputFormat: string };
        try {
          edgeResult = await attemptEdgeTts(edgeOutputFormat);
        } catch (err) {
          if (fallbackEdgeOutputFormat && fallbackEdgeOutputFormat !== edgeOutputFormat) {
            logVerbose(
              `TTS: Edge output ${edgeOutputFormat} failed; retrying with ${fallbackEdgeOutputFormat}.`,
            );
            edgeOutputFormat = fallbackEdgeOutputFormat;
            try {
              edgeResult = await attemptEdgeTts(edgeOutputFormat);
            } catch (fallbackErr) {
              try {
                rmSync(tempDir, { recursive: true, force: true });
              } catch {
                // ignore cleanup errors
              }
              throw fallbackErr;
            }
          } else {
            try {
              rmSync(tempDir, { recursive: true, force: true });
            } catch {
              // ignore cleanup errors
            }
            throw err;
          }
        }

        scheduleCleanup(tempDir);
        const voiceCompatible = isVoiceCompatibleAudio({ fileName: edgeResult.audioPath });

        return {
          success: true,
          audioPath: edgeResult.audioPath,
          latencyMs: Date.now() - providerStart,
          provider,
          outputFormat: edgeResult.outputFormat,
          voiceCompatible,
        };
      }

      const apiKey = resolveTtsApiKey(config, provider);
      if (!apiKey) {
        lastError = `No API key for ${provider}`;
        continue;
      }

      // 630:P3 #60 -- Factory Method dispatch.
      const synth = createTtsBufferSynthesizer(provider);
      if (!synth) {
        lastError = `${provider}: unsupported buffer provider`;
        continue;
      }
      const audioBuffer = await synth({
        text: params.text,
        apiKey,
        config,
        output,
        overrides: params.overrides,
      });

      const latencyMs = Date.now() - providerStart;

      const tempDir = mkdtempSync(path.join(tmpdir(), "tts-"));
      const audioPath = path.join(tempDir, `voice-${Date.now()}${output.extension}`);
      writeFileSync(audioPath, audioBuffer);
      scheduleCleanup(tempDir);

      return {
        success: true,
        audioPath,
        latencyMs,
        provider,
        outputFormat: provider === "openai" ? output.openai : output.elevenlabs,
        voiceCompatible: output.voiceCompatible,
      };
    } catch (err) {
      const error = err as Error;
      if (error.name === "AbortError") {
        lastError = `${provider}: request timed out`;
      } else {
        lastError = `${provider}: ${error.message}`;
      }
    }
  }

  return {
    success: false,
    error: `TTS conversion failed: ${lastError || "no providers available"}`,
  };
}

export async function textToSpeechTelephony(params: {
  text: string;
  cfg: OpenClawConfig;
  prefsPath?: string;
}): Promise<TtsTelephonyResult> {
  const config = resolveTtsConfig(params.cfg);
  const prefsPath = params.prefsPath ?? resolveTtsPrefsPath(config);

  if (params.text.length > config.maxTextLength) {
    return {
      success: false,
      error: `Text too long (${params.text.length} chars, max ${config.maxTextLength})`,
    };
  }

  const userProvider = getTtsProvider(config, prefsPath);
  const providers = resolveTtsProviderOrder(userProvider);

  let lastError: string | undefined;

  for (const provider of providers) {
    const providerStart = Date.now();
    try {
      if (provider === "edge") {
        lastError = "edge: unsupported for telephony";
        continue;
      }

      const apiKey = resolveTtsApiKey(config, provider);
      if (!apiKey) {
        lastError = `No API key for ${provider}`;
        continue;
      }

      // 630:P3 #60 -- Factory Method dispatch (telephony path).
      const synth = createTtsTelephonySynthesizer(provider);
      if (!synth) {
        lastError = `${provider}: unsupported for telephony`;
        continue;
      }
      const result = await synth({ text: params.text, apiKey, config });

      return {
        success: true,
        audioBuffer: result.buffer,
        latencyMs: Date.now() - providerStart,
        provider,
        outputFormat: result.outputFormat,
        sampleRate: result.sampleRate,
      };
    } catch (err) {
      const error = err as Error;
      if (error.name === "AbortError") {
        lastError = `${provider}: request timed out`;
      } else {
        lastError = `${provider}: ${error.message}`;
      }
    }
  }

  return {
    success: false,
    error: `TTS conversion failed: ${lastError || "no providers available"}`,
  };
}

export async function maybeApplyTtsToPayload(params: {
  payload: ReplyPayload;
  cfg: OpenClawConfig;
  channel?: string;
  kind?: "tool" | "block" | "final";
  inboundAudio?: boolean;
  ttsAuto?: string;
}): Promise<ReplyPayload> {
  const config = resolveTtsConfig(params.cfg);
  const prefsPath = resolveTtsPrefsPath(config);
  const autoMode = resolveTtsAutoMode({
    config,
    prefsPath,
    sessionAuto: params.ttsAuto,
  });
  if (autoMode === "off") {
    return params.payload;
  }

  const text = params.payload.text ?? "";
  const directives = parseTtsDirectives(text, config.modelOverrides);
  if (directives.warnings.length > 0) {
    logVerbose(`TTS: ignored directive overrides (${directives.warnings.join("; ")})`);
  }

  const cleanedText = directives.cleanedText;
  const trimmedCleaned = cleanedText.trim();
  const visibleText = trimmedCleaned.length > 0 ? trimmedCleaned : "";
  const ttsText = directives.ttsText?.trim() || visibleText;

  const nextPayload =
    visibleText === text.trim()
      ? params.payload
      : {
          ...params.payload,
          text: visibleText.length > 0 ? visibleText : undefined,
        };

  if (autoMode === "tagged" && !directives.hasDirective) {
    return nextPayload;
  }
  if (autoMode === "inbound" && params.inboundAudio !== true) {
    return nextPayload;
  }

  const mode = config.mode ?? "final";
  if (mode === "final" && params.kind && params.kind !== "final") {
    return nextPayload;
  }

  if (!ttsText.trim()) {
    return nextPayload;
  }
  if (params.payload.mediaUrl || (params.payload.mediaUrls?.length ?? 0) > 0) {
    return nextPayload;
  }
  if (text.includes("MEDIA:")) {
    return nextPayload;
  }
  if (ttsText.trim().length < 10) {
    return nextPayload;
  }

  const maxLength = getTtsMaxLength(prefsPath);
  let textForAudio = ttsText.trim();
  let wasSummarized = false;

  if (textForAudio.length > maxLength) {
    if (!isSummarizationEnabled(prefsPath)) {
      // Truncate text when summarization is disabled
      logVerbose(
        `TTS: truncating long text (${textForAudio.length} > ${maxLength}), summarization disabled.`,
      );
      textForAudio = `${textForAudio.slice(0, maxLength - 3)}...`;
    } else {
      // Summarize text when enabled
      try {
        const summary = await summarizeText({
          text: textForAudio,
          targetLength: maxLength,
          cfg: params.cfg,
          config,
          timeoutMs: config.timeoutMs,
        });
        textForAudio = summary.summary;
        wasSummarized = true;
        if (textForAudio.length > config.maxTextLength) {
          logVerbose(
            `TTS: summary exceeded hard limit (${textForAudio.length} > ${config.maxTextLength}); truncating.`,
          );
          textForAudio = `${textForAudio.slice(0, config.maxTextLength - 3)}...`;
        }
      } catch (err) {
        const error = err as Error;
        logVerbose(`TTS: summarization failed, truncating instead: ${error.message}`);
        textForAudio = `${textForAudio.slice(0, maxLength - 3)}...`;
      }
    }
  }

  const ttsStart = Date.now();
  const result = await textToSpeech({
    text: textForAudio,
    cfg: params.cfg,
    prefsPath,
    channel: params.channel,
    overrides: directives.overrides,
  });

  if (result.success && result.audioPath) {
    lastTtsAttempt = {
      timestamp: Date.now(),
      success: true,
      textLength: text.length,
      summarized: wasSummarized,
      provider: result.provider,
      latencyMs: result.latencyMs,
    };

    const channelId = resolveChannelId(params.channel);
    const shouldVoice = channelId === "telegram" && result.voiceCompatible === true;
    const finalPayload = {
      ...nextPayload,
      mediaUrl: result.audioPath,
      audioAsVoice: shouldVoice || params.payload.audioAsVoice,
    };
    return finalPayload;
  }

  lastTtsAttempt = {
    timestamp: Date.now(),
    success: false,
    textLength: text.length,
    summarized: wasSummarized,
    error: result.error,
  };

  const latency = Date.now() - ttsStart;
  logVerbose(`TTS: conversion failed after ${latency}ms (${result.error ?? "unknown"}).`);
  return nextPayload;
}

// 630:P3 #60 -- restore _test re-export of isValidVoiceId after upstream
// commit 87b2de341 moved the implementation into elevenlabs.ts but left
// this test surface broken on main.
export const _test = {
  isValidVoiceId,
  isValidOpenAIVoice,
  isValidOpenAIModel,
  OPENAI_TTS_MODELS,
  OPENAI_TTS_VOICES,
  parseTtsDirectives,
  resolveModelOverridePolicy,
  summarizeText,
  resolveOutputFormat,
  resolveEdgeOutputFormat,
};
