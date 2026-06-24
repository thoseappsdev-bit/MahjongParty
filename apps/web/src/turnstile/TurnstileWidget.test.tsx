import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TurnstileWidget } from "./TurnstileWidget";

const source = readFileSync(new URL("./TurnstileWidget.tsx", import.meta.url), "utf8");

describe("TurnstileWidget", () => {
  it("keeps the caller action separate from the Spin DOM telemetry marker", () => {
    const markup = renderToStaticMarkup(
      <TurnstileWidget
        siteKey="site-key"
        action="room_create"
        resetKey={1}
        onToken={vi.fn()}
      />,
    );

    expect(markup).toContain('class="cf-turnstile"');
    expect(markup).toContain('data-sitekey="site-key"');
    expect(markup).toContain('data-action="turnstile-spin-v1"');
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Security verification"');
    expect(markup).toContain("width:150px");
    expect(markup).toContain("min-height:140px");
    expect(markup).not.toContain('data-action="room_create"');
  });

  it("remounts when its action or reset key changes", () => {
    expect(source).toContain(
      "createTurnstileRenderOptions(siteKey, action, publishToken)",
    );
    expect(source).toContain("}, [siteKey, action, resetKey]);");
  });
});
