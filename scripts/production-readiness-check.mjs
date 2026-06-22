import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function read(path) {
  return readFileSync(path, "utf8");
}

check("release automation files exist", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    ".github/workflows/cloudflare-deploy.yml",
    ".github/workflows/codeql.yml",
    "scripts/secret-scan.mjs",
    "scripts/smoke-production.mjs",
    "docs/production-release.md",
    "apps/web/public/_headers",
    "wrangler.jsonc",
  ]) {
    assert(existsSync(path), `${path} is missing`);
  }
});

check("local secret files are gitignored", () => {
  for (const path of [".env", ".env.local", ".dev.vars", "apps/web/.env", "artifacts/smoke.png", "supabase/.temp/cli-latest"]) {
    const result = spawnSync("git", ["check-ignore", "-q", path], { stdio: "ignore" });
    assert(result.status === 0, `${path} is not ignored by git`);
  }
});

check("Cloudflare Worker config has Durable Objects and observability", () => {
  const wrangler = read("wrangler.jsonc");
  assert(wrangler.includes('"name": "mahjong-party"'), "wrangler Worker name is missing");
  assert(wrangler.includes('"MAHJONG_ROOM"'), "Durable Object binding is missing");
  assert(wrangler.includes('"observability"') && wrangler.includes('"enabled": true'), "Worker observability is not enabled");
});

check("web build ships baseline security headers", () => {
  const headers = read("apps/web/public/_headers");
  for (const token of [
    "Content-Security-Policy:",
    "frame-ancestors https://discord.com https://*.discord.com",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Permissions-Policy:",
  ]) {
    assert(headers.includes(token), `security header missing: ${token}`);
  }
  assert(!headers.includes("X-Frame-Options"), "X-Frame-Options would break Discord Activity embedding");
});

check("web entry bundle stays below the first-load budget", () => {
  const assetsDir = "apps/web/dist/assets";
  assert(existsSync(assetsDir), "apps/web/dist/assets is missing; run pnpm build first");
  const entryFiles = readdirSync(assetsDir).filter((file) => /^index-[^/]+\.js$/.test(file));
  assert(entryFiles.length > 0, "web entry bundle was not found in dist assets");
  const largest = entryFiles
    .map((file) => ({ file, size: statSync(`${assetsDir}/${file}`).size }))
    .sort((a, b) => b.size - a.size)[0];
  assert(largest.size <= 350_000, `${largest.file} is ${largest.size} bytes, over the 350 KB entry budget`);
});

check("package scripts include production gates", () => {
  const pkg = readJson("package.json");
  for (const script of ["test", "build", "check:cloudflare", "deploy:cloudflare", "security:secrets", "production:check", "production:smoke"]) {
    assert(pkg.scripts?.[script], `package script missing: ${script}`);
  }
});

check("CI runs secret scan, tests, build, Cloudflare dry-run, and production checks", () => {
  const ci = read(".github/workflows/ci.yml");
  for (const command of ["pnpm security:secrets", "pnpm test", "pnpm build", "pnpm check:cloudflare", "pnpm production:check"]) {
    assert(ci.includes(command), `CI does not run ${command}`);
  }
});

check("deploy workflow runs gates and smoke after deploy", () => {
  const deploy = read(".github/workflows/cloudflare-deploy.yml");
  for (const command of [
    "pnpm security:secrets",
    "pnpm test",
    "pnpm build",
    "pnpm check:cloudflare",
    "pnpm production:check",
    "pnpm deploy:cloudflare",
    "pnpm production:smoke",
  ]) {
    assert(deploy.includes(command), `deploy workflow does not run ${command}`);
  }
  assert(deploy.includes("MAHJONG_PRODUCTION_URL"), "deploy workflow does not expose MAHJONG_PRODUCTION_URL");

  const deployOrder = [
    "pnpm security:secrets",
    "pnpm test",
    "pnpm build",
    "pnpm check:cloudflare",
    "pnpm production:check",
    "pnpm deploy:cloudflare",
    "pnpm production:smoke",
  ].map((command) => deploy.indexOf(command));
  assert(deployOrder.every((index) => index >= 0), "deploy workflow order check could not find all commands");
  assert(deployOrder.every((index, position) => position === 0 || index > deployOrder[position - 1]), "deploy workflow gates are not ordered before deploy/smoke");

  const releaseDoc = read("docs/production-release.md");
  assert(releaseDoc.includes("MAHJONG_PRODUCTION_URL"), "production release docs do not mention MAHJONG_PRODUCTION_URL");
  assert(releaseDoc.includes("reruns the production gates before deploy"), "production release docs do not describe deploy workflow gates");
});
check("manual deploy uses Cloudflare and public client secrets only", () => {
  const deploy = read(".github/workflows/cloudflare-deploy.yml");
  for (const secret of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_DISCORD_CLIENT_ID"]) {
    assert(deploy.includes(`secrets.${secret}`), `deploy workflow missing ${secret}`);
  }
  assert(!deploy.includes("SUPABASE_SERVICE_ROLE_KEY"), "service role key should stay in Cloudflare Worker secrets, not GitHub build env");
});

check("production economy and paid-table surfaces fail closed", () => {
  const worker = read("apps/worker/src/index.ts");
  for (const token of [
    'economyMode: economyModeFor(env)',
    'Persistent economy is not configured',
    'Mission progress is recorded by authoritative matches',
    'Rewarded ads are not enabled',
    'Store purchase verification is not enabled',
    '{ ...catalog, gemPacks: [] }',
  ]) {
    assert(worker.includes(token), `Worker production guard missing: ${token}`);
  }
  assert(!worker.includes('economyService.verifyPurchase('), "Worker still grants purchases without provider verification");

  const app = read("apps/web/src/App.tsx");
  assert(app.includes("Coin tables require an authoritative online room"), "web app does not block local paid-table flow");
  assert(!app.includes("buyInFromBackend"), "web app still imports direct buy-in mutation");
  assert(!app.includes("payTableEntry"), "web app still exposes local paid-table reservation helper");
});
check("production smoke and secret scripts are wired", () => {
  const smoke = read("scripts/smoke-production.mjs");
  for (const token of [
    "/health",
    "/api/economy/catalog",
    "/api/analytics/events",
    "frame-ancestors https://discord.com https://*.discord.com",
    "MAHJONG_EXPECTED_ECONOMY_MODE",
    "health.economyMode",
    "catalog.gemPacks.length === 0",
  ]) {
    assert(smoke.includes(token), `production smoke script missing ${token}`);
  }

  const secretScan = read("scripts/secret-scan.mjs");
  for (const token of ["git", "ls-files", "SUPABASE_SERVICE_ROLE_KEY", "CLOUDFLARE_API_TOKEN", "artifacts\\/", "supabase\\/\\.temp\\/"]) {
    assert(secretScan.includes(token), `secret scan script missing ${token}`);
  }

  const releaseDoc = read("docs/production-release.md");
  for (const token of ["pnpm security:secrets", "pnpm production:smoke", "live Worker health response"]) {
    assert(releaseDoc.includes(token), `production release docs missing ${token}`);
  }
});

check("GitHub security scanning is configured", () => {
  const codeql = read(".github/workflows/codeql.yml");
  for (const token of [
    "github/codeql-action/init@v4",
    "github/codeql-action/analyze@v4",
    "security-events: write",
    "javascript-typescript",
    "security-and-quality",
  ]) {
    assert(codeql.includes(token), `CodeQL workflow missing ${token}`);
  }

  const releaseDoc = read("docs/production-release.md");
  assert(!releaseDoc.includes("`r`n"), "release docs contain escaped newline markers");
  for (const token of [
    "Protect `main`",
    "Dependabot alerts",
    "secret scanning",
    "CI and CodeQL are green",
  ]) {
    assert(releaseDoc.includes(token), `production release docs missing ${token}`);
  }
});

check("repository hygiene templates are present", () => {
  const dependabot = read(".github/dependabot.yml");
  assert(dependabot.includes("package-ecosystem: npm"), "Dependabot does not update npm dependencies");
  assert(dependabot.includes("package-ecosystem: github-actions"), "Dependabot does not update GitHub Actions");

  const prTemplate = read(".github/pull_request_template.md");
  for (const command of ["pnpm security:secrets", "pnpm test", "pnpm build", "pnpm check:cloudflare", "pnpm production:check"]) {
    assert(prTemplate.includes(command), `PR template does not mention ${command}`);
  }

  const releaseIssue = read(".github/ISSUE_TEMPLATE/production_release.md");
  assert(releaseIssue.includes("Discord Activity"), "production release template does not include Discord Activity check");
  assert(releaseIssue.includes("Multiplayer smoke"), "production release template does not include multiplayer smoke check");
});

const failures = [];
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`fail - ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  process.exit(1);
}