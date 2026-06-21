import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Settings.tsx", import.meta.url), "utf8");

describe("Settings account panel", () => {
  it("renders account status, email sign-in, sign-out, and guest reset controls", () => {
    expect(source).toContain("AccountSettings");
    expect(source).toContain("settings.accountTitle");
    expect(source).toContain("onSendMagicLink");
    expect(source).toContain("onSignOut");
    expect(source).toContain("onNewGuest");
    expect(source).toContain("settings.emailPlaceholder");
  });
});
