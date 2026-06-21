import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, list) => {
    if (!arg.startsWith("--")) {
      return [];
    }
    const next = list[index + 1];
    return [[arg.slice(2), next && !next.startsWith("--") ? next : "true"]];
  }),
);

const apiBase = args.get("api") ?? process.env.MAHJONG_ASSET_API ?? "http://127.0.0.1:8787";
const provider = args.get("provider") ?? "openai";
const prompt =
  args.get("prompt") ??
  "Old Hong Kong mahjong table skin concept, jade green felt, warm brass rail, carved dark wood edge, premium mobile game UI asset, top-down usable board surface, readable center area, no text, no people";
const size = args.get("size") ?? "1024x1024";
const quality = args.get("quality") ?? "low";
const outputFormat = args.get("format") ?? "png";
const aspectRatio = args.get("aspect") ?? "1:1";
const outDir = args.get("out") ?? "artifacts/generated";
const slug = args.get("name") ?? `mahjong-${provider}-${Date.now()}`;
const shouldPoll = args.get("poll") !== "false";
const existingFalRequestId = args.get("fal-request-id");

await mkdir(outDir, { recursive: true });

const result = existingFalRequestId
  ? { provider: "fal", status: "queued", requestId: existingFalRequestId }
  : await generateAsset();

const saved = [];
if (result.provider === "openai" && result.status === "completed") {
  for (const [index, image] of (result.images ?? []).entries()) {
    if (image.b64Json) {
      const path = join(outDir, `${slug}-${index + 1}.${outputFormat}`);
      await writeFile(path, Buffer.from(image.b64Json, "base64"));
      saved.push(path);
      continue;
    }

    if (image.url) {
      const path = await downloadImage(image.url, join(outDir, `${slug}-${index + 1}`));
      saved.push(path);
    }
  }
}

if (result.provider === "fal" && result.status === "queued") {
  await writeMetadata({ saved: [`fal queued: ${result.requestId}`] });
  if (shouldPoll) {
    const falResult = await waitForFalResult(result.requestId);
    for (const [index, image] of (falResult.images ?? []).entries()) {
      if (image.url) {
        const path = await downloadImage(image.url, join(outDir, `${slug}-${index + 1}`));
        saved.push(path);
      }
    }
    result.final = falResult;
  } else {
    saved.push(`fal queued: ${result.requestId}`);
  }
}

const metadataPath = await writeMetadata({ saved });

console.log(JSON.stringify({ ok: true, provider, saved, metadataPath }, null, 2));

async function generateAsset() {
  const response = await fetch(`${apiBase}/api/assets/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, prompt, size, quality, outputFormat, aspectRatio }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error ?? `Asset generation failed with HTTP ${response.status}`);
  }
  return result;
}

async function writeMetadata({ saved }) {
  const metadataPath = join(outDir, `${slug}.json`);
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        provider,
        prompt,
        size,
        quality,
        outputFormat,
        aspectRatio,
        saved,
        requestId: result.requestId,
        usage: result.usage,
        final: result.final,
      },
      null,
      2,
    ),
  );
  return metadataPath;
}

async function downloadImage(url, fallbackPath) {
  const imageResponse = await fetch(url);
  if (!imageResponse.ok) {
    throw new Error(`Image download failed with HTTP ${imageResponse.status}`);
  }
  const contentType = imageResponse.headers.get("content-type") ?? "image/png";
  const extension = extname(new URL(url).pathname) || extensionForContentType(contentType);
  const path = `${fallbackPath}${extension}`;
  await writeFile(path, Buffer.from(await imageResponse.arrayBuffer()));
  return path;
}

async function waitForFalResult(requestId) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(`${apiBase}/api/assets/fal/${encodeURIComponent(requestId)}/status`);
    const status = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) {
      throw new Error(status.error ?? `fal status failed with HTTP ${statusResponse.status}`);
    }

    if (status.status === "COMPLETED") {
      const resultResponse = await fetch(`${apiBase}/api/assets/fal/${encodeURIComponent(requestId)}/result`);
      const result = await resultResponse.json().catch(() => ({}));
      if (!resultResponse.ok) {
        throw new Error(result.error ?? `fal result failed with HTTP ${resultResponse.status}`);
      }
      return result;
    }

    if (status.error) {
      throw new Error(`fal generation failed: ${status.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`fal generation timed out for request ${requestId}`);
}

function extensionForContentType(contentType) {
  if (contentType.includes("jpeg")) {
    return ".jpg";
  }
  if (contentType.includes("webp")) {
    return ".webp";
  }
  return ".png";
}
