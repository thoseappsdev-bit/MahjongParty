import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const [, , command, ...args] = process.argv;

if (!command) {
  console.error("Usage: node scripts/run-with-env.mjs <command> [...args]");
  process.exit(1);
}

loadEnvFile(resolve(process.cwd(), ".env"));

const resolvedCommand = resolveCommand(command, args);
const child = spawn(resolvedCommand.command, resolvedCommand.args, {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`${command} exited with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

function loadEnvFile(path) {
  let text = "";

  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");

    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = stripQuotes(line.slice(equalsIndex + 1).trim());

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function resolveCommand(value, commandArgs) {
  if (value === "wrangler") {
    return {
      command: process.execPath,
      args: [resolve(process.cwd(), "node_modules/wrangler/bin/wrangler.js"), ...commandArgs],
    };
  }

  if (process.platform !== "win32") {
    return { command: value, args: commandArgs };
  }

  if (/[\\/]/.test(value) || /\.[a-z0-9]+$/i.test(value)) {
    return { command: value, args: commandArgs };
  }

  if (["npm", "npx", "pnpm"].includes(value)) {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", value, ...commandArgs] };
  }

  return { command: value, args: commandArgs };
}
