/**
 * Abstract Factory for embeddings providers.
 *
 * Before this PR, the embeddings provider family lived in five separate
 * vocabularies inside `embeddings.ts`:
 *   1. the string union  ("openai" | "local" | "gemini" | "voyage")
 *   2. the createProvider switch (one branch per id)
 *   3. the auto-mode fallback array  (["openai","gemini","voyage"])
 *   4. the result shape (optional fields per provider)
 *   5. the per-id formatSetupError dispatch
 *
 * Adding a new provider was a textbook Shotgun Surgery edit: a new
 * branch + a new optional field + a new fallback entry + a new error
 * formatting case. None of it was compiler-enforced.
 *
 * This module introduces an `EmbeddingProviderFactory` interface and a
 * registry of concrete factories. Each factory owns its id, default
 * model, creation logic, and setup-error formatting in one place. The
 * `createEmbeddingProvider` switch becomes a registry lookup; the
 * `auto`-mode order becomes the named constant `AUTO_FALLBACK_ORDER`.
 */

import { createGeminiEmbeddingProvider, type GeminiEmbeddingClient } from "./embeddings-gemini.js";
import { createOpenAiEmbeddingProvider, type OpenAiEmbeddingClient } from "./embeddings-openai.js";
import { createVoyageEmbeddingProvider, type VoyageEmbeddingClient } from "./embeddings-voyage.js";

export type EmbeddingProviderId = "openai" | "local" | "gemini" | "voyage";

/**
 * The shape any concrete embeddings client returns. The optional client
 * fields preserve backward compatibility with the legacy
 * EmbeddingProviderResult shape (used by `manager.ts` to reach into
 * provider-specific clients without re-discriminating).
 */
export type EmbeddingProviderProduct = {
  provider: {
    id: string;
    model: string;
    embedQuery: (text: string) => Promise<number[]>;
    embedBatch: (texts: string[]) => Promise<number[][]>;
  };
  openAi?: OpenAiEmbeddingClient;
  gemini?: GeminiEmbeddingClient;
  voyage?: VoyageEmbeddingClient;
};

/** A factory for one embeddings-provider family. */
export type EmbeddingProviderFactory<TOptions = unknown> = {
  readonly id: EmbeddingProviderId;
  /** Provider-specific creation. The factory owns the SDK + the result shape. */
  create(options: TOptions): Promise<EmbeddingProviderProduct>;
  /** Provider-specific setup-error formatting (Local has a long install hint; others are plain). */
  formatSetupError(err: unknown): string;
};

function defaultFormatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

// One factory per provider. Each one owns its branch of the legacy
// switch + the way its setup errors should be rendered.

export const openAiEmbeddingFactory: EmbeddingProviderFactory<unknown> = {
  id: "openai",
  async create(options) {
    const { provider, client } = await createOpenAiEmbeddingProvider(
      options as Parameters<typeof createOpenAiEmbeddingProvider>[0],
    );
    return { provider, openAi: client };
  },
  formatSetupError: defaultFormatError,
};

export const geminiEmbeddingFactory: EmbeddingProviderFactory<unknown> = {
  id: "gemini",
  async create(options) {
    const { provider, client } = await createGeminiEmbeddingProvider(
      options as Parameters<typeof createGeminiEmbeddingProvider>[0],
    );
    return { provider, gemini: client };
  },
  formatSetupError: defaultFormatError,
};

export const voyageEmbeddingFactory: EmbeddingProviderFactory<unknown> = {
  id: "voyage",
  async create(options) {
    const { provider, client } = await createVoyageEmbeddingProvider(
      options as Parameters<typeof createVoyageEmbeddingProvider>[0],
    );
    return { provider, voyage: client };
  },
  formatSetupError: defaultFormatError,
};

/**
 * Local factory. The actual creation logic + the verbose setup-error
 * formatting live in `embeddings.ts` (because they pull in node-llama-cpp
 * lazily and have a long install hint message). The factory accepts both
 * dependencies as injection so this module stays node-llama-cpp-free.
 */
export type LocalEmbeddingDeps = {
  createLocalProvider: (options: unknown) => Promise<EmbeddingProviderProduct["provider"]>;
  formatLocalSetupError: (err: unknown) => string;
};

export function createLocalEmbeddingFactory(
  deps: LocalEmbeddingDeps,
): EmbeddingProviderFactory<unknown> {
  return {
    id: "local",
    async create(options) {
      const provider = await deps.createLocalProvider(options);
      return { provider };
    },
    formatSetupError: deps.formatLocalSetupError,
  };
}

/**
 * The Abstract Factory registry. The string union appears here exactly
 * once (in the keys); adding a new provider means adding one entry.
 */
export type EmbeddingProviderRegistry = ReadonlyMap<EmbeddingProviderId, EmbeddingProviderFactory>;

export function createEmbeddingProviderRegistry(
  localFactory: EmbeddingProviderFactory,
): EmbeddingProviderRegistry {
  return new Map<EmbeddingProviderId, EmbeddingProviderFactory>([
    [openAiEmbeddingFactory.id, openAiEmbeddingFactory],
    [geminiEmbeddingFactory.id, geminiEmbeddingFactory],
    [voyageEmbeddingFactory.id, voyageEmbeddingFactory],
    [localFactory.id, localFactory],
  ]);
}

/**
 * Named, documented `auto`-mode fallback order. The implicit array
 * literal that used to live inside the loop is now a constant.
 */
export const AUTO_FALLBACK_ORDER: ReadonlyArray<Exclude<EmbeddingProviderId, "local">> = [
  "openai",
  "gemini",
  "voyage",
];
