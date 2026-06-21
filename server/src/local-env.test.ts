import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "./local-env";

describe("local env loader", () => {
  const envKey = "MAHJONG_PARTY_ENV_TEST_KEY";
  let tempRoot: string | null = null;

  afterEach(() => {
    delete process.env[envKey];
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it("loads a parent .env when the server command runs from a package directory", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "mahjong-env-"));
    const serverDir = join(tempRoot, "server");
    mkdirSync(serverDir);
    writeFileSync(join(tempRoot, ".env"), `${envKey}=loaded-from-root\n`);

    loadLocalEnv(serverDir);

    expect(process.env[envKey]).toBe("loaded-from-root");
  });
});
