import { describe, expect, it } from "vitest";
import { createRoomService } from "./room-service";

describe("room service", () => {
  it("creates a room with the host seated and a replayable create event", () => {
    const service = createRoomService({ now: () => 1813053600000, code: () => "JADE42" });
    const room = service.createRoom({ hostUserId: "u_lina", displayName: "Lina", avatar: "L" });

    expect(room.roomCode).toBe("JADE42");
    expect(room.seats[0]).toMatchObject({ userId: "u_lina", displayName: "Lina", ready: true });
    expect(room.events).toHaveLength(1);
    expect(room.events[0]).toMatchObject({ sequence: 1, action: { type: "room.created", actorSeat: 0 } });
  });

  it("joins the first open seat and appends a room event", () => {
    const service = createRoomService({ now: () => 1813053600000, code: () => "JADE42" });
    service.createRoom({ hostUserId: "u_lina", displayName: "Lina", avatar: "L" });
    const room = service.joinRoom("JADE42", { userId: "u_bo", displayName: "Bo", avatar: "B" });

    expect(room.seats[1]).toMatchObject({ userId: "u_bo", displayName: "Bo", ready: true });
    expect(room.events.at(-1)).toMatchObject({ sequence: 2, action: { type: "room.joined", actorSeat: 1 } });
  });

  it("submits match actions as ordered events", () => {
    const service = createRoomService({ now: () => 1813053600000, code: () => "JADE42" });
    service.createRoom({ hostUserId: "u_lina", displayName: "Lina", avatar: "L" });
    const room = service.submitAction("JADE42", {
      seat: 0,
      type: "discard",
      payload: { tile: "m9" },
      clientActionId: "local-1",
    });

    expect(room.events.at(-1)).toMatchObject({
      sequence: 2,
      action: { type: "match.discard", actorSeat: 0, clientActionId: "local-1", payload: { tile: "m9" } },
    });
  });

  it("replays room membership from the event log", () => {
    const service = createRoomService({ now: () => 1813053600000, code: () => "JADE42" });
    const created = service.createRoom({ hostUserId: "u_lina", displayName: "Lina", avatar: "L" });
    const joined = service.joinRoom(created.roomCode, { userId: "u_bo", displayName: "Bo", avatar: "B" });

    const replayed = service.replayRoom(joined.events);

    expect(replayed.seats[0]?.userId).toBe("u_lina");
    expect(replayed.seats[1]?.userId).toBe("u_bo");
  });
});
