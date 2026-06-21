export type AssetProvider = "openai" | "fal";

export interface AssetGenerateInput {
  provider?: AssetProvider;
  prompt?: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high" | "auto";
  outputFormat?: "png" | "webp" | "jpeg";
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
}

export interface AssetProviderStatus {
  openai: { configured: boolean };
  fal: { configured: boolean };
}

export interface AssetImage {
  url?: string;
  b64Json?: string;
  revisedPrompt?: string;
  width?: number;
  height?: number;
  contentType?: string;
}

export type AssetGenerateResult =
  | {
      provider: "openai";
      status: "completed";
      images: AssetImage[];
      usage?: unknown;
    }
  | {
      provider: "fal";
      status: "queued";
      requestId: string;
      statusUrl?: string;
      responseUrl?: string;
      queuePosition?: number;
    };

export interface AssetService {
  providerStatus: () => AssetProviderStatus;
  generate: (input: AssetGenerateInput) => Promise<AssetGenerateResult>;
  falStatus: (requestId: string) => Promise<unknown>;
  falResult: (requestId: string) => Promise<unknown>;
}

export function createAssetService({
  env = process.env,
  fetchImpl = fetch,
}: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
} = {}): AssetService {
  function openAiKey(): string | undefined {
    return env.OPENAI_API_KEY || env.CHATGPT_API_KEY;
  }

  function falKey(): string | undefined {
    return env.FAL_KEY || env.FAL_AI_API_KEY || env.fal_ai_api_key;
  }

  return {
    providerStatus() {
      return {
        openai: { configured: Boolean(openAiKey()) },
        fal: { configured: Boolean(falKey()) },
      };
    },

    async generate(input) {
      const prompt = normalizedPrompt(input.prompt);
      const provider = input.provider ?? "openai";
      if (provider === "openai") {
        return generateOpenAiImage(fetchImpl, openAiKey(), { ...input, prompt });
      }
      if (provider === "fal") {
        return submitFalImage(fetchImpl, falKey(), { ...input, prompt });
      }
      throw new Error("Unsupported asset provider");
    },

    async falStatus(requestId) {
      return fetchFalJson(fetchImpl, falKey(), falRequestUrl(requestId, "status"));
    },

    async falResult(requestId) {
      return fetchFalJson(fetchImpl, falKey(), falRequestUrl(requestId, "response"));
    },
  };
}

async function generateOpenAiImage(
  fetchImpl: typeof fetch,
  apiKey: string | undefined,
  input: Required<Pick<AssetGenerateInput, "prompt">> & AssetGenerateInput,
): Promise<AssetGenerateResult> {
  if (!apiKey) {
    throw new Error("OpenAI image API is not configured");
  }

  const response = await fetchImpl("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
      prompt: input.prompt,
      size: input.size ?? "1024x1024",
      quality: input.quality ?? "medium",
      output_format: input.outputFormat ?? "png",
    }),
  });

  const body = await parseProviderResponse(response, "OpenAI image generation failed");
  const data = Array.isArray(body.data) ? body.data : [];
  return {
    provider: "openai",
    status: "completed",
    images: data.map((entry: any) => ({
      url: entry.url,
      b64Json: entry.b64_json,
      revisedPrompt: entry.revised_prompt,
    })),
    usage: body.usage,
  };
}

async function submitFalImage(
  fetchImpl: typeof fetch,
  apiKey: string | undefined,
  input: Required<Pick<AssetGenerateInput, "prompt">> & AssetGenerateInput,
): Promise<AssetGenerateResult> {
  if (!apiKey) {
    throw new Error("fal image API is not configured");
  }

  const response = await fetchImpl("https://queue.fal.run/fal-ai/nano-banana-2", {
    method: "POST",
    headers: {
      authorization: `Key ${apiKey}`,
      "content-type": "application/json",
      "x-fal-no-retry": "1",
    },
    body: JSON.stringify({
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? "1:1",
      output_format: input.outputFormat ?? "png",
    }),
  });

  const body = await parseProviderResponse(response, "fal Nano Banana request failed");
  return {
    provider: "fal",
    status: "queued",
    requestId: String(body.request_id ?? ""),
    statusUrl: body.status_url,
    responseUrl: body.response_url,
    queuePosition: body.queue_position,
  };
}

async function fetchFalJson(
  fetchImpl: typeof fetch,
  apiKey: string | undefined,
  url: string,
  method = "GET",
): Promise<unknown> {
  if (!apiKey) {
    throw new Error("fal image API is not configured");
  }

  const response = await fetchImpl(url, {
    method,
    headers: { authorization: `Key ${apiKey}` },
  });
  return parseProviderResponse(response, "fal request lookup failed");
}

async function parseProviderResponse(response: Response, message: string): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = typeof body?.error === "string" ? body.error : body?.error?.message;
    throw new Error(`${message} with HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : ""}`);
  }
  return body;
}

function normalizedPrompt(prompt: string | undefined): string {
  const trimmed = prompt?.trim() ?? "";
  if (trimmed.length < 8) {
    throw new Error("Asset prompt is too short");
  }
  return trimmed.slice(0, 1_200);
}

function falRequestUrl(requestId: string, action: "status" | "response"): string {
  const cleanId = requestId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!cleanId) {
    throw new Error("fal request id is required");
  }
  const baseUrl = `https://queue.fal.run/fal-ai/nano-banana-2/requests/${cleanId}`;
  return action === "status" ? `${baseUrl}/status` : baseUrl;
}
