import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Coins, Gem, Gift, Sparkles } from "lucide-react";

type Tone = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
}

export function Button({ tone = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`mp-button mp-button-${tone} ${className}`.trim()} {...props} />;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`mp-panel ${className}`.trim()}>{children}</section>;
}

export function CurrencyPill({ kind, label, value }: { kind: "coins" | "gems"; label?: string; value: number }) {
  const Icon = kind === "coins" ? Coins : Gem;

  return (
    <span className={`mp-currency mp-currency-${kind}`}>
      <Icon aria-hidden="true" size={16} />
      <span>{value.toLocaleString()}</span>
      <span className="mp-currency-label">{label ?? (kind === "coins" ? "Coins" : "Gems")}</span>
    </span>
  );
}

export function TableCard({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="mp-table-card">
      <div>
        <h3>{title}</h3>
        <p>{meta}</p>
      </div>
      <div className="mp-table-card-body">{children}</div>
      {action}
    </article>
  );
}

export function RewardChip({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="mp-reward-chip">
      <Gift aria-hidden="true" size={16} />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </span>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="mp-toast" role="status">
      <Sparkles aria-hidden="true" size={16} />
      {message}
    </div>
  );
}
