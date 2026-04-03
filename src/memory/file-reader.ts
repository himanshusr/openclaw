import fs from "node:fs/promises";
import path from "node:path";
import { isMemoryPath, normalizeExtraMemoryPaths } from "./utils.js";

/**
 * Read a memory-indexed file by relative path, enforcing workspace
 * and additional-path boundaries.
 */
export async function readMemoryFile(params: {
  relPath: string;
  from?: number;
  lines?: number;
  workspaceDir: string;
  extraPaths: string[];
}): Promise<{ text: string; path: string }> {
  const rawPath = params.relPath.trim();
  if (!rawPath) {
    throw new Error("path required");
  }
  const absPath = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(params.workspaceDir, rawPath);
  const relPath = path.relative(params.workspaceDir, absPath).replace(/\\/g, "/");
  const inWorkspace =
    relPath.length > 0 && !relPath.startsWith("..") && !path.isAbsolute(relPath);
  const allowedWorkspace = inWorkspace && isMemoryPath(relPath);
  let allowedAdditional = false;
  if (!allowedWorkspace && params.extraPaths.length > 0) {
    const additionalPaths = normalizeExtraMemoryPaths(params.workspaceDir, params.extraPaths);
    for (const additionalPath of additionalPaths) {
      try {
        const stat = await fs.lstat(additionalPath);
        if (stat.isSymbolicLink()) {
          continue;
        }
        if (stat.isDirectory()) {
          if (
            absPath === additionalPath ||
            absPath.startsWith(`${additionalPath}${path.sep}`)
          ) {
            allowedAdditional = true;
            break;
          }
          continue;
        }
        if (stat.isFile()) {
          if (absPath === additionalPath && absPath.endsWith(".md")) {
            allowedAdditional = true;
            break;
          }
        }
      } catch {}
    }
  }
  if (!allowedWorkspace && !allowedAdditional) {
    throw new Error("path required");
  }
  if (!absPath.endsWith(".md")) {
    throw new Error("path required");
  }
  const stat = await fs.lstat(absPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("path required");
  }
  const content = await fs.readFile(absPath, "utf-8");
  if (!params.from && !params.lines) {
    return { text: content, path: relPath };
  }
  const lines = content.split("\n");
  const start = Math.max(1, params.from ?? 1);
  const count = Math.max(1, params.lines ?? lines.length);
  const slice = lines.slice(start - 1, start - 1 + count);
  return { text: slice.join("\n"), path: relPath };
}
