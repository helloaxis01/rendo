import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.join(import.meta.dirname, "..");

function fileUrl(filePath) {
  return pathToFileURL(filePath).href;
}

function resolveAlias(specifier) {
  const rel = specifier.slice(2);
  const base = path.join(root, rel);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return fileUrl(candidate);
    }
  }
  return fileUrl(base);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(resolveAlias(specifier), context);
  }
  return nextResolve(specifier, context);
}
