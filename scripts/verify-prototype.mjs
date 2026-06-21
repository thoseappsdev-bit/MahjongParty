import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import playwright from "playwright";

const { chromium } = playwright;
const baseUrl = "http://127.0.0.1:5173";
const outDir = new URL("../artifacts/", import.meta.url);
const desktopMatchScreenshot = fileURLToPath(new URL("prototype-desktop-match.png", outDir));
const desktopScreenshot = fileURLToPath(new URL("prototype-desktop-result.png", outDir));
const mobileScreenshot = fileURLToPath(new URL("prototype-mobile-match.png", outDir));
const botClaimScreenshot = fileURLToPath(new URL("prototype-bot-claim-resolved.png", outDir));
const practiceScreenshot = fileURLToPath(new URL("prototype-practice-after-discard.png", outDir));
const zhScreenshot = fileURLToPath(new URL("prototype-zh-settings.png", outDir));

async function enterMatch(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Play Tables/i }).first().click();
  await page.getByRole("button", { name: /Create Table/i }).click();
  await page.getByRole("button", { name: /Create Friend Room/i }).click();
  await page.getByRole("button", { name: /Share/i }).click();
  await page.getByRole("button", { name: /Start Hand/i }).click();
}

async function waitForPlayerMove(page) {
  await page.waitForFunction(() => {
    const feed = document.querySelector(".event-feed")?.textContent ?? "";
    const buttons = [...document.querySelectorAll(".action-bar button")];
    const playerHasMove = buttons.some((button) => ["Chi", "Pong", "Kong", "Win", "Discard"].includes(button.textContent?.trim() ?? "") && !button.disabled);
    return feed.includes("is available") || feed.includes("Your turn") || playerHasMove;
  });
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await enterMatch(desktop);
const desktopTurnBannerVisible = await desktop.locator(".turn-banner").getByText(/Your turn/i).isVisible();
await desktop.screenshot({ path: desktopMatchScreenshot, fullPage: true });
await desktop.locator(".tile-button").first().click();
await waitForPlayerMove(desktop);
await desktop.screenshot({ path: desktopScreenshot, fullPage: true });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await enterMatch(mobile);
const mobileActionBarPosition = await mobile
  .locator(".action-bar")
  .evaluate((node) => window.getComputedStyle(node).position);
const mobileLayout = await mobile.evaluate(() => {
  const actionBar = document.querySelector(".action-bar");
  const table = document.querySelector(".mahjong-table");
  const tableCenter = document.querySelector(".table-center");
  const leftRail = document.querySelector(".opponent-rail.left");
  const rightRail = document.querySelector(".opponent-rail.right");
  const myRail = document.querySelector(".my-rail");
  const leftTiles = document.querySelector(".opponent-rail.left .tile-backs");
  const rightTiles = document.querySelector(".opponent-rail.right .tile-backs");
  const topBar = document.querySelector(".top-bar");
  const bottomNav = document.querySelector(".bottom-nav");
  const overlaps = (first, second) => {
    if (!first || !second) {
      return false;
    }
    const a = first.getBoundingClientRect();
    const b = second.getBoundingClientRect();
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  };
  return {
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    actionBarWidth: Math.round(actionBar?.getBoundingClientRect().width ?? 0),
    actionBarScrollWidth: actionBar?.scrollWidth ?? 0,
    tableHeight: Math.round(table?.getBoundingClientRect().height ?? 0),
    leftTileDirection: leftTiles ? window.getComputedStyle(leftTiles).flexDirection : null,
    rightTileDirection: rightTiles ? window.getComputedStyle(rightTiles).flexDirection : null,
    topBarDisplay: topBar ? window.getComputedStyle(topBar).display : null,
    bottomNavDisplay: bottomNav ? window.getComputedStyle(bottomNav).display : null,
    sideRailOverlapsCenter: overlaps(leftRail, tableCenter) || overlaps(rightRail, tableCenter),
    actionBarOverlapsBoard: overlaps(actionBar, tableCenter) || overlaps(actionBar, myRail),
  };
});
if (
  !desktopTurnBannerVisible ||
  mobileActionBarPosition !== "static" ||
  mobileLayout.scrollWidth > mobileLayout.clientWidth ||
  mobileLayout.actionBarScrollWidth > mobileLayout.actionBarWidth + 2 ||
  mobileLayout.tableHeight > 700 ||
  mobileLayout.leftTileDirection !== "column" ||
  mobileLayout.rightTileDirection !== "column" ||
  mobileLayout.topBarDisplay !== "none" ||
  mobileLayout.bottomNavDisplay !== "none" ||
  mobileLayout.sideRailOverlapsCenter ||
  mobileLayout.actionBarOverlapsBoard
) {
  throw new Error(
    `Match UX verification failed: turnBanner=${desktopTurnBannerVisible}, mobileActionBar=${mobileActionBarPosition}, mobileLayout=${JSON.stringify(mobileLayout)}`,
  );
}
await mobile.locator(".mp-toast").waitFor({ state: "hidden", timeout: 3000 }).catch(() => undefined);
await mobile.screenshot({ path: mobileScreenshot, fullPage: false });

const botClaim = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await botClaim.addInitScript(() => {
  Date.now = () => 2;
});
await enterMatch(botClaim);
await botClaim.locator(".tile-button").first().click();
await botClaim.locator(".event-feed").getByText(/Claim window opened/i).waitFor();
await botClaim.locator(".event-feed").getByText(/Chen Bot claimed PONG on M6/i).waitFor();
const botClaimMeldVisible = await botClaim.locator(".meld-list").getByText(/PUNG 6M/i).isVisible();
const botOnlyClaimResolved =
  !(await botClaim.getByRole("button", { name: /^Chi$/i }).isEnabled()) &&
  !(await botClaim.getByRole("button", { name: /^Pong$/i }).isEnabled()) &&
  !(await botClaim.getByRole("button", { name: /^Kong$/i }).isEnabled());
if (!botOnlyClaimResolved || !botClaimMeldVisible) {
  const botClaimFeed = await botClaim.locator(".event-feed").textContent();
  throw new Error(`Bot-only claim verification failed: resolved=${botOnlyClaimResolved}, meld=${botClaimMeldVisible}, feed=${botClaimFeed}`);
}
await botClaim.screenshot({ path: botClaimScreenshot, fullPage: true });

const practice = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await practice.addInitScript(() => {
  Date.now = () => 6145;
});
await practice.goto(baseUrl, { waitUntil: "networkidle" });
await practice.getByRole("button", { name: /Start Practice/i }).click();
await practice.getByRole("heading", { name: /Old Hong Kong 3 Fan/i }).waitFor();
const tutorialVisible = await practice.getByRole("dialog", { name: /Quick Tutorial/i }).isVisible().catch(() => false);
const initialClaimButtonsDisabled =
  !(await practice.getByRole("button", { name: /^Chi$/i }).isEnabled()) &&
  !(await practice.getByRole("button", { name: /^Pong$/i }).isEnabled()) &&
  !(await practice.getByRole("button", { name: /^Kong$/i }).isEnabled());
const timerBefore = await practice.locator(".timer").textContent();
await practice.waitForTimeout(1150);
const timerAfter = await practice.locator(".timer").textContent();
await practice.locator(".action-control").first().locator(".action-info").hover();
const chiTooltipVisible = await practice.getByText(/claim the previous player's discard/i).isVisible();
const leftTileDirection = await practice
  .locator(".opponent-rail.left .tile-backs")
  .evaluate((node) => window.getComputedStyle(node).flexDirection);
const rightTileDirection = await practice
  .locator(".opponent-rail.right .tile-backs")
  .evaluate((node) => window.getComputedStyle(node).flexDirection);
const tableOverflowY = await practice.locator(".mahjong-table").evaluate((node) => window.getComputedStyle(node).overflowY);
const discardCloudOverflowY = await practice
  .locator(".discard-cloud")
  .evaluate((node) => window.getComputedStyle(node).overflowY);
const bottomLabelCenterOffset = await practice.locator(".my-rail .player-strip").evaluate((node) => {
  const label = node.getBoundingClientRect();
  const rail = document.querySelector(".my-rail")?.getBoundingClientRect();
  if (!rail) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.round(Math.abs(label.left + label.width / 2 - (rail.left + rail.width / 2)));
});
const handBeforeDiscard = await practice.locator(".tile-button").count();
await practice.locator(".tile-button").first().click();
await practice.locator(".event-feed").getByText(/Bo Bot is thinking/i).waitFor();
await practice.waitForFunction(() => {
  const feed = document.querySelector(".event-feed")?.textContent ?? "";
  const buttons = [...document.querySelectorAll(".action-bar button")];
  const playerHasMove = buttons.some((button) => ["Chi", "Pong", "Kong", "Win", "Discard"].includes(button.textContent?.trim() ?? "") && !button.disabled);
  return feed.includes("Dewi Bot discarded") || feed.includes("is available") || playerHasMove;
});
const handAfterDiscard = await practice.locator(".tile-button").count();
const pongEnabledForM8 = await practice.getByRole("button", { name: /^Pong$/i }).isEnabled();
const playerHasAvailableMove =
  (await practice.getByRole("button", { name: /^Chi$/i }).isEnabled()) ||
  (await practice.getByRole("button", { name: /^Pong$/i }).isEnabled()) ||
  (await practice.getByRole("button", { name: /^Kong$/i }).isEnabled()) ||
  (await practice.getByRole("button", { name: /^Win$/i }).isEnabled()) ||
  (await practice.getByRole("button", { name: /^Discard$/i }).isEnabled());
const botDiscardText = await practice.locator(".match-header p").textContent();
const botDiscardTextIncludesBot = botDiscardText?.includes("Bot") ?? false;
const practiceEventFeedText = await practice.locator(".event-feed").textContent();
const practiceEventFeedShowsBotSteps =
  /Bo Bot drew/i.test(practiceEventFeedText ?? "") &&
  /Bo Bot discarded/i.test(practiceEventFeedText ?? "") &&
  /Chen Bot discarded/i.test(practiceEventFeedText ?? "") &&
  /Dewi Bot discarded/i.test(practiceEventFeedText ?? "");
await practice.getByRole("button", { name: /^Pong$/i }).click();
await practice.getByRole("button", { name: /^Discard$/i }).waitFor({ state: "visible" });
const discardEnabledAfterPong = await practice.getByRole("button", { name: /^Discard$/i }).isEnabled();
const pongClaimText = await practice.locator(".event-feed").textContent();
if (
  tutorialVisible ||
  !initialClaimButtonsDisabled ||
  timerBefore === timerAfter ||
  !chiTooltipVisible ||
  leftTileDirection !== "column" ||
  rightTileDirection !== "column" ||
  tableOverflowY !== "auto" ||
  discardCloudOverflowY !== "auto" ||
  bottomLabelCenterOffset > 2 ||
  !playerHasAvailableMove ||
  !pongEnabledForM8 ||
  !discardEnabledAfterPong ||
  !botDiscardTextIncludesBot ||
  !practiceEventFeedShowsBotSteps
) {
  throw new Error(
    `Practice verification failed: tutorial=${tutorialVisible}, claimDisabled=${initialClaimButtonsDisabled}, timer=${timerBefore}->${timerAfter}, tooltip=${chiTooltipVisible}, left=${leftTileDirection}, right=${rightTileDirection}, tableOverflow=${tableOverflowY}, discardOverflow=${discardCloudOverflowY}, bottomOffset=${bottomLabelCenterOffset}, playerHasMove=${playerHasAvailableMove}, pongEnabled=${pongEnabledForM8}, discardAfterPong=${discardEnabledAfterPong}, event=${botDiscardText}, feed=${practiceEventFeedText}, pongFeed=${pongClaimText}`,
  );
}
await practice.screenshot({ path: practiceScreenshot, fullPage: true });

const tutorial = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await tutorial.goto(baseUrl, { waitUntil: "networkidle" });
await tutorial.getByRole("button", { name: /^Tutorial$/i }).click();
await tutorial.getByRole("heading", { name: /Old Hong Kong 3 Fan/i }).waitFor();
const tutorialTimerHidden = (await tutorial.locator(".timer").count()) === 0;
const tutorialWhyVisible = await tutorial.getByText(/Why Chi/i).isVisible();
await tutorial.getByRole("button", { name: /Skip Tutorial/i }).click();
const tutorialSteps = [];
for (const action of ["Chi", "Pong", "Kong", "Win"]) {
  const enabled = {
    chi: await tutorial.getByRole("button", { name: /^Chi$/i }).isEnabled(),
    pong: await tutorial.getByRole("button", { name: /^Pong$/i }).isEnabled(),
    kong: await tutorial.getByRole("button", { name: /^Kong$/i }).isEnabled(),
    win: await tutorial.getByRole("button", { name: /^Win$/i }).isEnabled(),
  };
  tutorialSteps.push(enabled);
  await tutorial.getByRole("button", { name: new RegExp(`^${action}$`, "i") }).click();
}
await tutorial.locator(".event-feed").getByText(/Scenario 2/i).waitFor();
await tutorial.locator(".table-center .tutorial-scenario-banner").getByText(/Scenario 2/i).waitFor();
const tutorialHandTwoVisible = await tutorial.locator(".match-header p").getByText(/Hand 2/i).isVisible();
const tutorialSecondScenarioWinOnly =
  !(await tutorial.getByRole("button", { name: /^Chi$/i }).isEnabled()) &&
  !(await tutorial.getByRole("button", { name: /^Pong$/i }).isEnabled()) &&
  !(await tutorial.getByRole("button", { name: /^Kong$/i }).isEnabled()) &&
  (await tutorial.getByRole("button", { name: /^Win$/i }).isEnabled());
await tutorial.getByRole("button", { name: /^Win$/i }).click();
await tutorial.getByRole("heading", { name: /Lina Wins/i }).waitFor();
const tutorialSequenceOk =
  tutorialSteps[0].chi &&
  !tutorialSteps[0].pong &&
  !tutorialSteps[0].kong &&
  !tutorialSteps[0].win &&
  !tutorialSteps[1].chi &&
  tutorialSteps[1].pong &&
  !tutorialSteps[1].kong &&
  !tutorialSteps[1].win &&
  !tutorialSteps[2].chi &&
  !tutorialSteps[2].pong &&
  tutorialSteps[2].kong &&
  !tutorialSteps[2].win &&
  !tutorialSteps[3].chi &&
  !tutorialSteps[3].pong &&
  !tutorialSteps[3].kong &&
  tutorialSteps[3].win;
if (!tutorialTimerHidden || !tutorialWhyVisible || !tutorialSequenceOk || !tutorialSecondScenarioWinOnly || !tutorialHandTwoVisible) {
  throw new Error(
    `Tutorial verification failed: timerHidden=${tutorialTimerHidden}, whyVisible=${tutorialWhyVisible}, secondScenario=${tutorialSecondScenarioWinOnly}, handTwo=${tutorialHandTwoVisible}, steps=${JSON.stringify(tutorialSteps)}`,
  );
}

const zh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await zh.goto(baseUrl, { waitUntil: "networkidle" });
await zh.getByLabel("Primary").getByRole("button", { name: /^Settings$/i }).click();
await zh.getByRole("button", { name: "中文" }).click();
await zh.getByRole("heading", { name: "设置" }).waitFor();
const zhSettingsBody = await zh.locator(".settings-panel").textContent();
await zh.screenshot({ path: zhScreenshot, fullPage: true });

const desktopTitle = await desktop.title();
const mobileHeading = await mobile.getByRole("heading").first().textContent();
await browser.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      desktopTitle,
      desktopTurnBannerVisible,
      mobileHeading,
      mobileActionBarPosition,
      mobileLayout,
      practice: {
        tutorialVisible,
        initialClaimButtonsDisabled,
        timerBefore,
        timerAfter,
        chiTooltipVisible,
        leftTileDirection,
        rightTileDirection,
        tableOverflowY,
        discardCloudOverflowY,
        bottomLabelCenterOffset,
        handBeforeDiscard,
        handAfterDiscard,
        playerHasAvailableMove,
        pongEnabledForM8,
        discardEnabledAfterPong,
        botDiscardTextIncludesBot,
        practiceEventFeedShowsBotSteps,
      },
      tutorial: {
        tutorialTimerHidden,
        tutorialWhyVisible,
        tutorialSecondScenarioWinOnly,
        tutorialHandTwoVisible,
        tutorialSequenceOk,
      },
      botOnlyClaimResolved,
      botClaimMeldVisible,
      zhSettingsBodyIncludesTranslatedTheme: zhSettingsBody?.includes("牌桌主题") ?? false,
      screenshots: [
        "artifacts/prototype-desktop-match.png",
        "artifacts/prototype-desktop-result.png",
        "artifacts/prototype-mobile-match.png",
        "artifacts/prototype-bot-claim-resolved.png",
        "artifacts/prototype-practice-after-discard.png",
        "artifacts/prototype-zh-settings.png",
      ],
    },
    null,
    2,
  ),
);
