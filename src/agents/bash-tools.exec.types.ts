// Re-export the ExecToolDefaults / ExecElevatedDefaults types so that
// modules which only need the type (e.g. the Builder) can import without
// pulling in the full bash-tools.exec.ts runtime module. This breaks an
// otherwise circular import path between bash-tools.exec.ts and
// exec-tool-builder.ts.
export type { ExecToolDefaults, ExecElevatedDefaults } from "./bash-tools.exec.js";
