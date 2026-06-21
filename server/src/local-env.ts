import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

export function loadLocalEnv(startPath = process.cwd()): void {
  const path = resolveEnvPath(startPath);
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key]) {
      continue;
    }

    process.env[key] = unquoteEnvValue(trimmed.slice(separator + 1).trim());
  }
}

function resolveEnvPath(startPath: string): string {
  const resolved = resolve(startPath);
  if (existsSync(resolved) && statSync(resolved).isFile()) {
    return resolved;
  }

  let current = resolved;
  const root = parse(current).root;
  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }

    if (current === root) {
      return candidate;
    }
    current = dirname(current);
  }
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
