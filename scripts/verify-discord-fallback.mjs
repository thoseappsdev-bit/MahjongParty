import playwright from "playwright";

const { chromium } = playwright;
const baseUrl =
  process.env.DISCORD_FALLBACK_WEB_URL ??
  "http://127.0.0.1:5173/?frame_id=test-frame&instance_id=i-test-instance&platform=desktop";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Mahjong Party/i }).waitFor();
  const warningVisible = await page.getByText(/VITE_DISCORD_CLIENT_ID is required/i).isVisible();
  const proxiedHealth = await page.evaluate(async () => {
    const response = await fetch("/api/health");
    return response.ok ? response.json() : null;
  });

  if (!warningVisible || proxiedHealth?.service !== "mahjong-party-lan") {
    throw new Error(`Discord fallback failed: warning=${warningVisible}, health=${JSON.stringify(proxiedHealth)}`);
  }

  console.log(JSON.stringify({ ok: true, warningVisible, proxiedHealthService: proxiedHealth.service }, null, 2));
} finally {
  await browser.close();
}
