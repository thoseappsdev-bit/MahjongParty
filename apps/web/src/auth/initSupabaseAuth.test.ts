import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

import { sendSupabaseMagicLink } from "./initSupabaseAuth";

describe("initSupabaseAuth magic-link wrapper", () => {
  beforeEach(() => {
    mocks.signInWithOtp.mockReset().mockResolvedValue({ data: {}, error: null });
    mocks.getSupabaseClient.mockReset().mockReturnValue({
      auth: { signInWithOtp: mocks.signInWithOtp },
    });
  });

  it("forwards the captcha token to the Supabase auth controller", async () => {
    await sendSupabaseMagicLink(
      "friend@example.com",
      "https://mahjong.example.com/settings",
      "wrapper-captcha-token",
    );

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "friend@example.com",
      options: {
        emailRedirectTo: "https://mahjong.example.com/settings",
        captchaToken: "wrapper-captcha-token",
      },
    });
  });
});
