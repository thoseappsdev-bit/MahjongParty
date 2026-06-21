import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const tracked = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (tracked.status !== 0) {
  console.error(tracked.stderr || "git ls-files failed");
  process.exit(1);
}

const paths = tracked.stdout.split("\0").filter(Boolean);
const allowedTemplateFiles = new Set([".env.example", ".dev.vars.example", "apps/web/.env.example"]);
const forbiddenTracked = [/^\.dev\.vars$/, /^apps\/web\/\.env$/, /^artifacts\//, /^supabase\/\.temp\//];
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const secretAssignments = [
  "CHATGPT_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_SECRET",
  "FAL_AI_API_KEY",
  "FAL_KEY",
  "OPENAI_API_KEY",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const valuePlaceholders = new Set(["", "placeholder", "changeme", "change-me", "todo", "example", "your_client_secret_here"]);
const findings = [];

function isForbiddenTrackedPath(path) {
  if (allowedTemplateFiles.has(path)) {
    return false;
  }
  if (/^\.env(?:\..*)?$/.test(path)) {
    return true;
  }
  return forbiddenTracked.some((pattern) => pattern.test(path));
}

function isPlaceholderValue(value) {
  const normalized = value.toLowerCase();
  return (
    valuePlaceholders.has(normalized) ||
    normalized.startsWith("your_") ||
    normalized.endsWith("_here") ||
    (normalized.startsWith("<") && normalized.endsWith(">"))
  );
}

for (const path of paths) {
  if (isForbiddenTrackedPath(path)) {
    findings.push(`${path}: forbidden local/generated file is tracked`);
  }

  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (!textExtensions.has(ext)) {
    continue;
  }

  let content = "";
  try {
    content = readFileSync(path, "utf8");
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const name of secretAssignments) {
      const match = line.match(new RegExp(`(^|\\s)${name}\\s*=\\s*['\"]?([^'\"\\s#]+)?`, "i"));
      const value = match?.[2] ?? "";
      if (match && !isPlaceholderValue(value)) {
        findings.push(`${path}:${index + 1}: tracked non-placeholder value for ${name}`);
      }
    }

    if (/sk-[A-Za-z0-9_-]{20,}/.test(line)) {
      findings.push(`${path}:${index + 1}: possible OpenAI-style secret key`);
    }

    if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(line)) {
      findings.push(`${path}:${index + 1}: possible JWT secret/token`);
    }
  });
}

if (findings.length > 0) {
  console.error("Tracked secret scan failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, trackedFilesScanned: paths.length }, null, 2));