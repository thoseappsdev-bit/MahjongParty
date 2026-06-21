import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const env = loadEnvFile(resolve(process.cwd(), ".env"));
const requiredSecrets = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const optionalSecrets = ["SUPABASE_JWT_SECRET"];

for (const name of requiredSecrets) {
  const value = env[name] ?? process.env[name];
  if (!value) {
    console.error(`${name} is missing from .env`);
    process.exit(1);
  }

  await putSecret(name, value);
}

for (const name of optionalSecrets) {
  const value = env[name] ?? process.env[name];
  if (!value) {
    console.warn(`${name} is not set; protected routes will remain fail-closed until it is synced.`);
    continue;
  }

  await putSecret(name, value);
}

console.log("Cloudflare Supabase secrets synced.");

function loadEnvFile(path) {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }

  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    values[line.slice(0, equalsIndex).trim()] = stripQuotes(line.slice(equalsIndex + 1).trim());
  }
  return values;
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function putSecret(name, value) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [resolve(process.cwd(), "node_modules/wrangler/bin/wrangler.js"), "secret", "put", name], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "inherit", "inherit"],
    });

    child.stdin.end(value);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`wrangler secret put ${name} failed with exit code ${code ?? "unknown"}`));
    });
    child.on("error", rejectPromise);
  });
}
