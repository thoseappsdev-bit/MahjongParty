import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production table flow boundaries", () => {
  it("does not debit bankroll through a public economy endpoint before room creation", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("buyInFromBackend");
    expect(source).not.toContain("payTableEntry");
    expect(source).toContain("Coin tables require an authoritative online room");
  });

  it("waits for verified auth before loading private economy data", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain('useState(catalog.filter((item) => item.kind !== "gem-pack"))');
    expect(source).toContain("if (!authProfile) {");
    expect(source).toContain("getBackendWallet(lanApiBase, authProfile.userId)");
    expect(source).toContain("getDailyMissionsFromBackend(lanApiBase, authProfile.userId)");
  });
});