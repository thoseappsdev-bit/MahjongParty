import { describe, expect, it, vi } from "vitest";
import { createAssetService } from "./asset-service";

describe("asset service", () => {
  it("reports configured providers without exposing keys", () => {
    const service = createAssetService({
      env: { CHATGPT_API_KEY: "openai-secret", fal_ai_api_key: "fal-secret" },
      fetchImpl: vi.fn(),
    });

    expect(service.providerStatus()).toEqual({
      openai: { configured: true },
      fal: { configured: true },
    });
  });

  it("generates an OpenAI image through the server key", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        data: [{ b64_json: "base64-image", revised_prompt: "mahjong table" }],
        usage: { total_tokens: 123 },
      }),
    );
    const service = createAssetService({ env: { CHATGPT_API_KEY: "openai-secret" }, fetchImpl });

    const result = await service.generate({
      provider: "openai",
      prompt: "mahjong table skin",
      quality: "medium",
      size: "1024x1024",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer openai-secret" }),
      }),
    );
    expect(result).toMatchObject({
      provider: "openai",
      status: "completed",
      images: [{ b64Json: "base64-image" }],
    });
  });

  it("submits a fal Nano Banana 2 request through the server key", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        request_id: "request-123",
        status_url: "https://queue.fal.run/fal-ai/nano-banana-2/requests/request-123/status",
        response_url: "https://queue.fal.run/fal-ai/nano-banana-2/requests/request-123/response",
      }),
    );
    const service = createAssetService({ env: { fal_ai_api_key: "fal-secret" }, fetchImpl });

    const result = await service.generate({ provider: "fal", prompt: "mahjong lobby art" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://queue.fal.run/fal-ai/nano-banana-2",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Key fal-secret" }),
      }),
    );
    expect(result).toMatchObject({
      provider: "fal",
      status: "queued",
      requestId: "request-123",
    });
  });

  it("uses the fal request URL when retrieving a queued result", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ images: [] }));
    const service = createAssetService({ env: { fal_ai_api_key: "fal-secret" }, fetchImpl });

    await service.falResult("request-123");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://queue.fal.run/fal-ai/nano-banana-2/requests/request-123",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
