import { describe, expect, it, vi } from "vitest";
import {
  AUTO_FALLBACK_ORDER,
  createEmbeddingProviderRegistry,
  createLocalEmbeddingFactory,
  geminiEmbeddingFactory,
  openAiEmbeddingFactory,
  voyageEmbeddingFactory,
} from "./embedding-provider-factory.js";

describe("EmbeddingProviderRegistry (Abstract Factory)", () => {
  function makeLocalFactory() {
    return createLocalEmbeddingFactory({
      createLocalProvider: vi.fn().mockResolvedValue({
        id: "local",
        model: "test-local",
        embedQuery: async () => [0],
        embedBatch: async () => [[0]],
      }),
      formatLocalSetupError: vi.fn().mockReturnValue("local install hint"),
    });
  }

  it("registers all four built-in providers exactly once", () => {
    const registry = createEmbeddingProviderRegistry(makeLocalFactory());
    expect(registry.size).toBe(4);
    expect(registry.get("openai")?.id).toBe("openai");
    expect(registry.get("gemini")?.id).toBe("gemini");
    expect(registry.get("voyage")?.id).toBe("voyage");
    expect(registry.get("local")?.id).toBe("local");
  });

  it("local factory delegates create() to the injected createLocalProvider", async () => {
    const localFactory = makeLocalFactory();
    const product = await localFactory.create({});
    expect(product.provider.id).toBe("local");
    expect(product.openAi).toBeUndefined();
    expect(product.gemini).toBeUndefined();
    expect(product.voyage).toBeUndefined();
  });

  it("local factory delegates formatSetupError() to the injected formatter", () => {
    const localFactory = makeLocalFactory();
    const out = localFactory.formatSetupError(new Error("missing dep"));
    expect(out).toBe("local install hint");
  });

  it("non-local factories format setup errors with the default formatter (Error.message)", () => {
    expect(openAiEmbeddingFactory.formatSetupError(new Error("boom"))).toBe("boom");
    expect(geminiEmbeddingFactory.formatSetupError(new Error("nope"))).toBe("nope");
    expect(voyageEmbeddingFactory.formatSetupError(new Error("fail"))).toBe("fail");
  });

  it("non-local factories stringify non-Error inputs", () => {
    expect(openAiEmbeddingFactory.formatSetupError("x")).toBe("x");
    expect(openAiEmbeddingFactory.formatSetupError(123)).toBe("123");
  });

  it("AUTO_FALLBACK_ORDER excludes local and lists the three remote providers in order", () => {
    expect(AUTO_FALLBACK_ORDER).toEqual(["openai", "gemini", "voyage"]);
    // type-level: local cannot appear in this array
  });

  it("the registry's keys ARE the canonical provider id list (no other source)", () => {
    const registry = createEmbeddingProviderRegistry(makeLocalFactory());
    const ids = Array.from(registry.keys()).sort();
    expect(ids).toEqual(["gemini", "local", "openai", "voyage"]);
  });

  it("a custom local factory can completely replace the default behavior", async () => {
    const customLocal = createLocalEmbeddingFactory({
      createLocalProvider: vi.fn().mockResolvedValue({
        id: "local",
        model: "alt-local",
        embedQuery: async () => [1],
        embedBatch: async () => [[1]],
      }),
      formatLocalSetupError: () => "alt hint",
    });
    const registry = createEmbeddingProviderRegistry(customLocal);
    const product = await registry.get("local")!.create({});
    expect(product.provider.model).toBe("alt-local");
    expect(registry.get("local")!.formatSetupError(new Error("x"))).toBe("alt hint");
  });
});
