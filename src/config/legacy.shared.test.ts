import { describe, expect, it } from "vitest";
import {
  adaptLegacyMigration,
  type LegacyConfigMigration,
  type MigrationCommand,
  runMigrations,
} from "./legacy.shared.js";

describe("MigrationCommand + runMigrations Invoker (#65)", () => {
  it("returns null next when nothing applied", () => {
    const noop: MigrationCommand = {
      id: "noop",
      describe: "Does nothing",
      execute: () => ({ applied: false, changes: [] }),
    };
    const result = runMigrations({ a: 1 }, [noop]);
    expect(result.next).toBeNull();
    expect(result.changes).toEqual([]);
  });

  it("returns mutated next + change descriptions when at least one applies", () => {
    const renameAToB: MigrationCommand = {
      id: "rename-a-to-b",
      describe: "Renames key a to b",
      execute(ctx) {
        if (typeof ctx.raw.a !== "undefined") {
          ctx.raw.b = ctx.raw.a;
          delete ctx.raw.a;
          return { applied: true, changes: ["Renamed a to b"] };
        }
        return { applied: false, changes: [] };
      },
    };
    const result = runMigrations({ a: 42 }, [renameAToB]);
    expect(result.next).toEqual({ b: 42 });
    expect(result.changes).toEqual(["Renamed a to b"]);
  });

  it("does not mutate the input config (clones first)", () => {
    const renameInPlace: MigrationCommand = {
      id: "in-place",
      describe: "Test",
      execute(ctx) {
        ctx.raw.touched = true;
        return { applied: true, changes: ["touched"] };
      },
    };
    const input = { x: 1 };
    runMigrations(input, [renameInPlace]);
    expect(input).toEqual({ x: 1 });
    expect(input as Record<string, unknown>).not.toHaveProperty("touched");
  });

  it("runs commands in order and aggregates all change descriptions", () => {
    const trace: string[] = [];
    const make = (id: string): MigrationCommand => ({
      id,
      describe: id,
      execute() {
        trace.push(id);
        return { applied: true, changes: [`from-${id}`] };
      },
    });
    const result = runMigrations({}, [make("first"), make("second"), make("third")]);
    expect(trace).toEqual(["first", "second", "third"]);
    expect(result.changes).toEqual(["from-first", "from-second", "from-third"]);
  });

  it("returns empty result for non-object input", () => {
    expect(runMigrations(null, [])).toEqual({ next: null, changes: [] });
    expect(runMigrations("not an object", [])).toEqual({ next: null, changes: [] });
    expect(runMigrations(undefined, [])).toEqual({ next: null, changes: [] });
  });

  it("adaptLegacyMigration preserves apply() semantics", () => {
    const legacy: LegacyConfigMigration = {
      id: "legacy-1",
      describe: "Legacy migration",
      apply(raw, changes) {
        if (raw.flag === true) {
          raw.flag = "yes";
          changes.push("Coerced flag");
        }
      },
    };
    const command = adaptLegacyMigration(legacy);
    expect(command.id).toBe("legacy-1");
    expect(command.describe).toBe("Legacy migration");

    const ctxApplied = { raw: { flag: true } as Record<string, unknown> };
    expect(command.execute(ctxApplied)).toEqual({ applied: true, changes: ["Coerced flag"] });
    expect(ctxApplied.raw.flag).toBe("yes");

    const ctxSkipped = { raw: { flag: false } as Record<string, unknown> };
    expect(command.execute(ctxSkipped)).toEqual({ applied: false, changes: [] });
    expect(ctxSkipped.raw.flag).toBe(false);
  });
});
