import { useEffect, useRef } from "react";
import {
  createTurnstileRenderOptions,
  disposeTurnstileWidget,
  getTurnstileDomContract,
  loadTurnstile,
  type TurnstileAction,
  type TurnstileApi,
} from "./turnstileClient";

export interface TurnstileWidgetProps {
  siteKey: string;
  action: TurnstileAction;
  resetKey: string | number;
  onToken: (token: string | null) => void;
  ariaLabel?: string;
  className?: string;
}

export function TurnstileWidget({
  siteKey,
  action,
  resetKey,
  onToken,
  ariaLabel = "Security verification",
  className,
}: TurnstileWidgetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let active = true;
    let mountedWidget:
      | { api: TurnstileApi; widgetId: string }
      | undefined;

    const publishToken = (token: string | null) => {
      if (active) onTokenRef.current(token);
    };

    void loadTurnstile().then(
      (api) => {
        if (!active || !hostRef.current) return;

        try {
          const widgetId = api.render(
            hostRef.current,
            createTurnstileRenderOptions(siteKey, action, publishToken),
          );

          if (!active) {
            disposeTurnstileWidget(api, widgetId);
            return;
          }
          mountedWidget = { api, widgetId };
        } catch {
          publishToken(null);
        }
      },
      () => publishToken(null),
    );

    return () => {
      active = false;
      if (mountedWidget) {
        disposeTurnstileWidget(
          mountedWidget.api,
          mountedWidget.widgetId,
        );
      }
    };
  }, [siteKey, action, resetKey]);

  const domContract = getTurnstileDomContract(siteKey);

  return (
    <div
      ref={hostRef}
      className={["cf-turnstile", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={ariaLabel}
      style={{ width: 150, minHeight: 140 }}
      {...domContract}
    />
  );
}
