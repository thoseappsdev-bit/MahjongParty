import { Button, Panel } from "@mahjong/ui";
import { localeName, t } from "@mahjong/i18n";
import type { LocaleCode } from "@mahjong/shared-types";
import { useState } from "react";
import type { AuthProfile } from "../auth/initSupabaseAuth";

const locales: LocaleCode[] = ["en", "zh", "id"];

export interface SettingsAccountState {
  status: "checking" | "guest" | "signed-in" | "offline" | "error";
  profile: AuthProfile | null;
  userId: string;
  error?: string | null;
}

export function Settings({
  account,
  locale,
  onNewGuest,
  onLocaleChange,
  onSendMagicLink,
  onSignOut,
}: {
  account: SettingsAccountState;
  locale: LocaleCode;
  onNewGuest: () => Promise<{ ok: boolean; error?: string }>;
  onLocaleChange: (locale: LocaleCode) => void;
  onSendMagicLink: (email: string) => Promise<{ ok: boolean; error?: string }>;
  onSignOut: () => Promise<{ ok: boolean; error?: string }>;
}) {
  return (
    <div className="screen">
      <div className="screen-heading">
        <div>
          <h1>{t(locale, "settings.title")}</h1>
          <p>{t(locale, "settings.subtitle")}</p>
        </div>
      </div>

      <AccountSettings
        account={account}
        locale={locale}
        onNewGuest={onNewGuest}
        onSendMagicLink={onSendMagicLink}
        onSignOut={onSignOut}
      />

      <Panel className="settings-panel">
        <h2>{t(locale, "settings.language")}</h2>
        <div className="settings-row">
          {locales.map((entry) => (
            <Button
              key={entry}
              tone={locale === entry ? "primary" : "secondary"}
              onClick={() => onLocaleChange(entry)}
            >
              {localeName(entry)}
            </Button>
          ))}
        </div>
        <h2>{t(locale, "settings.theme")}</h2>
        <p>{t(locale, "settings.themeBody")}</p>
      </Panel>
    </div>
  );
}

function AccountSettings({
  account,
  locale,
  onNewGuest,
  onSendMagicLink,
  onSignOut,
}: {
  account: SettingsAccountState;
  locale: LocaleCode;
  onNewGuest: () => Promise<{ ok: boolean; error?: string }>;
  onSendMagicLink: (email: string) => Promise<{ ok: boolean; error?: string }>;
  onSignOut: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"email" | "guest" | "signout" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runAction(action: "email" | "guest" | "signout", callback: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(action);
    setMessage(null);
    const result = await callback();
    setBusy(null);
    if (!result.ok) {
      setMessage(result.error ?? t(locale, "settings.accountActionFailed"));
      return;
    }
    setMessage(
      action === "email"
        ? t(locale, "settings.magicLinkSent")
        : action === "guest"
          ? t(locale, "settings.guestStarted")
          : t(locale, "settings.signedOut"),
    );
  }

  const statusLabel = account.error
    ? t(locale, "settings.accountError")
    : account.status === "checking"
      ? t(locale, "settings.accountChecking")
      : account.status === "signed-in"
        ? t(locale, "settings.accountSignedIn")
        : account.status === "guest"
          ? t(locale, "settings.accountGuest")
          : t(locale, "settings.accountOffline");

  return (
    <Panel className="settings-panel account-panel">
      <div className="account-summary">
        <div>
          <h2>{t(locale, "settings.accountTitle")}</h2>
          <p>{t(locale, "settings.accountBody")}</p>
        </div>
        <span className={`account-status account-status-${account.error ? "error" : account.status}`}>
          {statusLabel}
        </span>
      </div>

      <div className="account-grid">
        <span>{t(locale, "settings.userId")}</span>
        <strong>{account.profile?.userId ?? account.userId}</strong>
        <span>{t(locale, "settings.email")}</span>
        <strong>{account.profile?.email ?? "-"}</strong>
      </div>

      <div className="account-email-row">
        <input
          type="email"
          value={email}
          placeholder={t(locale, "settings.emailPlaceholder")}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button
          tone="primary"
          onClick={() => runAction("email", () => onSendMagicLink(email))}
          disabled={busy !== null}
        >
          {busy === "email" ? t(locale, "settings.sending") : t(locale, "settings.sendMagicLink")}
        </Button>
      </div>

      <div className="account-actions">
        <Button tone="secondary" onClick={() => runAction("guest", onNewGuest)} disabled={busy !== null}>
          {busy === "guest" ? t(locale, "settings.startingGuest") : t(locale, "settings.newGuest")}
        </Button>
        <Button tone="ghost" onClick={() => runAction("signout", onSignOut)} disabled={busy !== null}>
          {busy === "signout" ? t(locale, "settings.signingOut") : t(locale, "settings.signOut")}
        </Button>
      </div>

      {(message || account.error) && <p className="account-message">{message ?? account.error}</p>}
    </Panel>
  );
}