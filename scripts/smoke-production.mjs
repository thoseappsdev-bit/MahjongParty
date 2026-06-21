const baseUrl = (process.argv[2] ?? process.env.MAHJONG_PRODUCTION_URL ?? "https://mahjong-party.youraimates.workers.dev").replace(/\/$/, "");
const expectedAuthMode = process.env.MAHJONG_EXPECTED_AUTH_MODE ?? "jwt";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(response, label) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return JSON: ${text.slice(0, 200)}`);
  }
}

const home = await fetch(`${baseUrl}/`);
assert(home.ok, `home returned HTTP ${home.status}`);
const headers = Object.fromEntries(home.headers.entries());
for (const [name, expected] of [
  ["content-security-policy", "frame-ancestors https://discord.com https://*.discord.com"],
  ["permissions-policy", "camera=()"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["x-content-type-options", "nosniff"],
]) {
  const value = headers[name] ?? "";
  assert(value.includes(expected), `${name} missing ${expected}; got ${value || "<empty>"}`);
}

const healthResponse = await fetch(`${baseUrl}/health`);
assert(healthResponse.ok, `health returned HTTP ${healthResponse.status}`);
const health = await readJson(healthResponse, "health");
assert(health.ok === true, "health ok flag is not true");
assert(health.service === "mahjong-party-cloudflare", `unexpected health service ${health.service}`);
assert(health.roomRuntime === "durable-object", `unexpected room runtime ${health.roomRuntime}`);
assert(health.authMode === expectedAuthMode, `expected authMode ${expectedAuthMode}, got ${health.authMode}`);

const catalogResponse = await fetch(`${baseUrl}/api/economy/catalog`);
assert(catalogResponse.ok, `catalog returned HTTP ${catalogResponse.status}`);
const catalog = await readJson(catalogResponse, "catalog");
assert(Array.isArray(catalog.coinPacks) && catalog.coinPacks.length > 0, "catalog coinPacks missing");
assert(Array.isArray(catalog.gemPacks) && catalog.gemPacks.length > 0, "catalog gemPacks missing");

const analyticsResponse = await fetch(`${baseUrl}/api/analytics/events`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "deploy.smoke", level: "info", message: "production smoke" }),
});
assert(analyticsResponse.ok, `analytics returned HTTP ${analyticsResponse.status}`);
const analytics = await readJson(analyticsResponse, "analytics");
assert(analytics.ok === true, "analytics ok flag is not true");

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      health,
      catalog: {
        coinPacks: catalog.coinPacks.length,
        gemPacks: catalog.gemPacks.length,
        cosmetics: Array.isArray(catalog.cosmetics) ? catalog.cosmetics.length : 0,
      },
      checkedHeaders: ["content-security-policy", "permissions-policy", "referrer-policy", "x-content-type-options"],
    },
    null,
    2,
  ),
);