import playwright from "playwright";

const { chromium } = playwright;
const baseUrl = process.env.LAN_WEB_URL ?? "http://127.0.0.1:5173";
const apiBase = process.env.LAN_API_URL ?? "http://127.0.0.1:8787";

const browser = await chromium.launch({ headless: true });
const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const guest = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
const lateHost = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const lateGuest = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });

try {
  await host.goto(baseUrl, { waitUntil: "networkidle" });
  await host.getByLabel(/LAN display name/i).fill("Host QA");
  await host.getByRole("button", { name: /Host LAN Room/i }).click();
  await host.getByRole("heading", { name: /Waiting Room/i }).waitFor();
  const roomCode = (await host.locator(".room-code span").first().textContent())?.trim();
  if (!roomCode) {
    throw new Error("Host did not show a LAN room code.");
  }

  await guest.goto(baseUrl, { waitUntil: "networkidle" });
  await guest.getByLabel(/LAN display name/i).fill("Guest QA");
  await guest.getByLabel(/LAN room code/i).fill(roomCode);
  await guest.getByRole("button", { name: /Join LAN/i }).click();
  await guest.getByRole("heading", { name: /Waiting Room/i }).waitFor();
  const guestWaitingText = await guest.locator(".room-panel").textContent();
  const guestStartDisabled = !(await guest.getByRole("button", { name: /Start Hand/i }).isEnabled());
  const guestShareHintVisible = /Friend URL: .*5173.*Code:/i.test(guestWaitingText ?? "");
  if (!guestWaitingText?.includes(roomCode) || !guestWaitingText.includes("Guest QA") || !guestStartDisabled || !guestShareHintVisible) {
    throw new Error(
      `Guest waiting room failed: room=${roomCode}, startDisabled=${guestStartDisabled}, shareHint=${guestShareHintVisible}, text=${guestWaitingText}`,
    );
  }
  const guestSession = await fetch(`${apiBase}/api/rooms/${roomCode}?seat=1`).then((response) => response.json());
  const guestUserId = guestSession.seats[1]?.userId;
  const guestStartResponse = await fetch(`${apiBase}/api/rooms/${roomCode}/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: guestUserId }),
  });
  const guestApiStartRejected = !guestStartResponse.ok;

  await host.getByRole("button", { name: /Start Hand/i }).click();
  await host.getByRole("heading", { name: /Old Hong Kong 3 Fan/i }).waitFor();
  await guest.getByRole("heading", { name: /Old Hong Kong 3 Fan/i }).waitFor();

  const hostHandBefore = await host.locator(".tile-button").count();
  const guestHandBefore = await guest.locator(".tile-button").count();
  const hostNameVisible = await host.locator(".my-rail .player-strip").getByText("Host QA").isVisible();
  const guestNameVisible = await guest.locator(".my-rail .player-strip").getByText("Guest QA").isVisible();
  await host.locator(".tile-button").first().click();
  await host.locator(".event-feed").getByText(/discarded|Claim window/i).first().waitFor({ timeout: 5000 });
  await guest.locator(".event-feed").getByText(/discarded|Claim window/i).first().waitFor({ timeout: 5000 });

  const hostHandAfter = await host.locator(".tile-button").count();
  const hostFeed = await host.locator(".event-feed").textContent();
  const guestFeed = await guest.locator(".event-feed").textContent();
  const hostDiscardRecorded = /Host QA discarded/i.test(hostFeed ?? "");
  const guestCanSeeSyncedAction = /discarded|Claim window/i.test(guestFeed ?? "");

  if (
    hostHandBefore < 1 ||
    guestHandBefore < 1 ||
    !hostDiscardRecorded ||
    !guestCanSeeSyncedAction ||
    !hostNameVisible ||
    !guestNameVisible ||
    !guestApiStartRejected ||
    !guestShareHintVisible
  ) {
    throw new Error(
      `LAN sync failed: hostHand=${hostHandBefore}->${hostHandAfter}, guestHand=${guestHandBefore}, hostDiscard=${hostDiscardRecorded}, hostName=${hostNameVisible}, guestName=${guestNameVisible}, guestApiRejected=${guestApiStartRejected}, guestFeed=${guestFeed}`,
    );
  }

  await lateHost.goto(baseUrl, { waitUntil: "networkidle" });
  await lateHost.getByLabel(/LAN display name/i).fill("Late Host");
  await lateHost.getByRole("button", { name: /Host LAN Room/i }).click();
  await lateHost.getByRole("heading", { name: /Waiting Room/i }).waitFor();
  const lateRoomCode = (await lateHost.locator(".room-code span").first().textContent())?.trim();
  if (!lateRoomCode) {
    throw new Error("Late-join host did not show a room code.");
  }
  await lateHost.getByRole("button", { name: /Start Hand/i }).click();
  await lateHost.getByRole("heading", { name: /Old Hong Kong 3 Fan/i }).waitFor();

  await lateGuest.goto(baseUrl, { waitUntil: "networkidle" });
  await lateGuest.getByLabel(/LAN display name/i).fill("Late Guest");
  await lateGuest.getByLabel(/LAN room code/i).fill(lateRoomCode);
  await lateGuest.getByRole("button", { name: /Join LAN/i }).click();
  await lateGuest.getByRole("heading", { name: /Old Hong Kong 3 Fan/i }).waitFor();
  const lateGuestNameVisible = await lateGuest.locator(".my-rail .player-strip").getByText("Late Guest").isVisible();

  await lateHost.locator(".tile-button").first().click();
  await lateGuest.waitForFunction(() => {
    const actionNames = new Set(["Chi", "Pong", "Kong", "Win", "Discard"]);
    return [...document.querySelectorAll(".action-bar button")].some(
      (button) => actionNames.has(button.textContent?.trim() ?? "") && !button.disabled,
    );
  });
  const lateGuestHasControls =
    (await lateGuest.getByRole("button", { name: /^Chi$/i }).isEnabled()) ||
    (await lateGuest.getByRole("button", { name: /^Pong$/i }).isEnabled()) ||
    (await lateGuest.getByRole("button", { name: /^Kong$/i }).isEnabled()) ||
    (await lateGuest.getByRole("button", { name: /^Win$/i }).isEnabled()) ||
    (await lateGuest.getByRole("button", { name: /^Discard$/i }).isEnabled());

  if (!lateGuestNameVisible || !lateGuestHasControls) {
    const lateFeed = await lateGuest.locator(".event-feed").textContent();
    throw new Error(
      `Late mobile join failed: name=${lateGuestNameVisible}, controls=${lateGuestHasControls}, feed=${lateFeed}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        roomCode,
        hostHandBefore,
        hostHandAfter,
        hostDiscardRecorded,
        guestHandBefore,
        guestStartDisabled,
        guestApiStartRejected,
        guestShareHintVisible,
        hostNameVisible,
        guestNameVisible,
        guestCanSeeSyncedAction,
        lateJoin: {
          roomCode: lateRoomCode,
          guestNameVisible: lateGuestNameVisible,
          guestHasControls: lateGuestHasControls,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
