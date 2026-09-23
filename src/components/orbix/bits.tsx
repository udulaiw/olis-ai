import { cx } from "../../lib/utils";
import { STATUS_LABEL, type Status } from "./data";

export function StatusTag({ status, className, compact }: { status: Status; className?: string; compact?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium tracking-[0.02em]",
        status === "live" && "bg-success-soft text-success",
        status === "beta" && "bg-lavender-soft text-lavender",
        status === "soon" && "border border-line text-faint",
        className,
      )}
    >
      {status !== "soon" && <span className="h-1 w-1 rounded-full bg-current" aria-hidden="true" />}
      {compact && status === "soon" ? "Soon" : STATUS_LABEL[status]}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return <span className={cx("badge-beta !bg-transparent !text-faint ring-1 ring-line", className)}>DEMO</span>;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-200",
        checked ? "border-transparent bg-accent" : "border-line-strong bg-surface-3",
      )}
    >
      <span
        className={cx(
          "inline-block h-4.5 w-4.5 rounded-full shadow-sm transition-transform duration-200 ease-[cubic-bezier(.3,.8,.3,1.2)]",
          checked ? "translate-x-[18px] bg-accent-ink" : "translate-x-[3px] bg-muted",
        )}
      />
    </button>
  );
}
