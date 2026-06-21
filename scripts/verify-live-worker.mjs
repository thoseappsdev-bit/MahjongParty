import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "https://mahjong-party.youraimates.workers.dev";
const errors = [];
const browser = await chromium.launch({ headless: true });

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  desktop.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });

  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  const title = await desktop.title();
  const bodyText = await desktop.locator("body").innerText({ timeout: 10_000 });
  await desktop.getByRole("button", { name: /Host LAN Room/i }).click();
  await desktop.waitForSelector(".room-code", { timeout: 10_000 });
  const roomCode = await desktop.locator(".room-code span").innerText();
  const shareHint = await desktop.locator(".room-note").first().innerText();
  await desktop.getByRole("button", { name: /Start Hand/i }).click();
  await desktop.waitForSelector(".mahjong-table", { timeout: 10_000 });
  const topPill = await desktop.locator(".opponent-rail.top .player-strip").evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      height: Math.round(rect.height),
      text: element.textContent?.replace(/\s+/g, " ").trim(),
      width: Math.round(rect.width),
    };
  });
  await desktop.screenshot({ path: "artifacts/live-worker-desktop-match.png", fullPage: false });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  mobile.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      errors.push(`mobile ${message.type()}: ${message.text()}`);
    }
  });
  await mobile.goto(`${baseUrl}/?room=${roomCode}`, { waitUntil: "networkidle" });
  const prefilledCode = await mobile.getByLabel("LAN room code").inputValue();
  await mobile.screenshot({ path: "artifacts/live-worker-mobile-invite.png", fullPage: false });

  console.log(
    JSON.stringify(
      {
        ok: true,
        title,
        hasAppText: bodyText.includes("Mahjong Party"),
        roomCode,
        shareHint,
        topPill,
        prefilledCode,
        screenshots: ["artifacts/live-worker-desktop-match.png", "artifacts/live-worker-mobile-invite.png"],
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
