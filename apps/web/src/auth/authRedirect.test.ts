import { describe, expect, it } from "vitest";
import { authRedirectUrl } from "./authRedirect";

describe("authRedirectUrl", () => {
  it("returns only the current origin", () => {
    expect(authRedirectUrl({ origin: "https://mahjong-party.youraimates.workers.dev" })).toBe(
      "https://mahjong-party.youraimates.workers.dev",
    );
  });
});
