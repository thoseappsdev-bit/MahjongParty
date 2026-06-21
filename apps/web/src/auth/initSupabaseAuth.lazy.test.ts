import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./initSupabaseAuth.ts", import.meta.url), "utf8");

describe("Supabase auth runtime loading", () => {
  it("does not statically import the Supabase client wrapper into the app entry chunk", () => {
    expect(source).not.toMatch(/import\s+\{\s*getSupabaseClient\s*\}\s+from\s+["']\.\/supabaseClient["']/);
    expect(source).toContain('await import("./supabaseClient")');
  });
});