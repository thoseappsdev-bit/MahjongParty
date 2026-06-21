import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@mahjong/game-core";
import { AuditReplayViewer, moveAuditReplayCursor, normalizeAuditReplayEvents } from "./AuditReplayViewer";

describe("AuditReplayViewer", () => {
  const events: MatchEvent[] = [
    {
      sequence: 1,
      occurredAt: "2026-06-19T08:00:00.000Z",
      source: "system",
      action: { type: "start", payload: { context: "East round hand 1" } },
    },
    {
      sequence: 2,
      occurredAt: "2026-06-19T08:00:05.000Z",
      source: "player",
      action: { type: "discard", actorSeat: 0, payload: { tile: "m5", context: "from drawn tile" } },
    },
    {
      sequence: 3,
      occurredAt: "2026-06-19T08:00:07.000Z",
      source: "bot",
      action: { type: "pong", actorSeat: 1, payload: { tile: "m5", fromSeat: 0 } },
    },
  ];

  it("normalizes match events into sequence, actor, action, tile, and context rows", () => {
    expect(normalizeAuditReplayEvents(events, ["Lina", "Bo Bot", "Chen Bot", "Dewi Bot"])).toEqual([
      {
        id: "audit-1",
        sequence: 1,
        actor: "System",
        action: "Start",
        tile: "None",
        context: "East round hand 1",
        occurredAt: "2026-06-19T08:00:00.000Z",
      },
      {
        id: "audit-2",
        sequence: 2,
        actor: "Lina",
        action: "Discard",
        tile: "m5",
        context: "from drawn tile",
        occurredAt: "2026-06-19T08:00:05.000Z",
      },
      {
        id: "audit-3",
        sequence: 3,
        actor: "Bo Bot",
        action: "Pong",
        tile: "m5",
        context: "from seat 1",
        occurredAt: "2026-06-19T08:00:07.000Z",
      },
    ]);
  });

  it("keeps replay cursor movement inside the available event range", () => {
    expect(moveAuditReplayCursor(0, -1, events.length)).toBe(0);
    expect(moveAuditReplayCursor(1, 1, events.length)).toBe(2);
    expect(moveAuditReplayCursor(2, 1, events.length)).toBe(2);
  });

  it("renders the current event and timeline controls", () => {
    const markup = renderToStaticMarkup(
      <AuditReplayViewer events={events} playerNames={["Lina", "Bo Bot", "Chen Bot", "Dewi Bot"]} />,
    );

    expect(markup).toContain("Audit Replay");
    expect(markup).toContain("Event 1 of 3");
    expect(markup).toContain("East round hand 1");
    expect(markup).toContain("Previous event");
    expect(markup).toContain("Next event");
  });
});
