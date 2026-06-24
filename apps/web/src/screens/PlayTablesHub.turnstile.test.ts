import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./PlayTablesHub.tsx", import.meta.url), "utf8");

describe("PlayTablesHub Turnstile gate", () => {
  it("requires a fresh room-create token before hosting LAN or Discord rooms", () => {
    expect(source).toContain("TurnstileWidget");
    expect(source).toContain('action="room_create"');
    expect(source).toContain("turnstileToken");
    expect(source).toContain("consumeTurnstileToken");
  });
});