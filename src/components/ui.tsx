import { useEffect, useRef, type ReactNode } from "react";
import { useStore } from "../store/AppStore";
import { Icon, type IconName } from "./Icon";
import { cx } from "../lib/utils";
import { LEVELS, STYLES, SUBJECTS, type Level, type LearningStyle, type Subject } from "../types";

// ── Toasts ─────────────────────────────────────
export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={cx(
            "pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-sm shadow-pop animate-pop",
            "border-line bg-surface text-ink",
          )}
        >
          <Icon
            name={t.kind === "error" ? "alert" : t.kind === "success" ? "check" : "info"}
            size={16}
            className={t.kind === "error" ? "text-danger" : t.kind === "success" ? "text-success" : "text-accent"}
          />
          <span className="leading-snug">{t.text}</span>
          <button className="ml-1 text-faint hover:text-ink" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Modal / confirm ────────────────────────────
export function Modal({ open, onClose, children, labelledBy }: { open: boolean; onClose: () => void; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    setTimeout(() => ref.current?.querySelector<HTMLElement>("[data-autofocus], button, input")?.focus(), 20);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="card relative w-full max-w-sm p-6 shadow-pop animate-pop">
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="confirm-title">
      <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose} data-autofocus>
          Cancel
        </button>
        <button
          className={cx("btn", danger ? "btn-danger" : "btn-primary")}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// ── Learning context picker ────────────────────
function SelectChip<T extends string>({ icon, label, value, options, onChange }: { icon: IconName; label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <label className="chip relative cursor-pointer pr-7 focus-within:border-line-strong focus-within:text-ink" title={label}>
      <Icon name={icon} size={14} className="shrink-0 text-faint" />
      <span className="sr-only">{label}</span>
      <span className="truncate">{value}</span>
      <Icon name="chevronDown" size={13} className="pointer-events-none absolute right-2.5 text-faint" />
      <select
        className="absolute inset-0 cursor-pointer opacity-0"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ContextBar({ className, compact, scroll }: { className?: string; compact?: boolean; scroll?: boolean }) {
  const { settings, setContext } = useStore();
  const c = settings.context;
  return (
    <div className={cx("flex items-center gap-2", scroll ? "no-scrollbar -mx-4 flex-nowrap overflow-x-auto px-4 [&>*]:shrink-0" : "flex-wrap", className)}>
      {!compact && <span className="eyebrow mr-1 hidden sm:inline">Learning context</span>}
      <SelectChip<Subject> icon="book" label="Subject" value={c.subject} options={SUBJECTS} onChange={(subject) => setContext({ subject })} />
      <SelectChip<Level> icon="layers" label="Level" value={c.level} options={LEVELS} onChange={(level) => setContext({ level })} />
      <SelectChip<LearningStyle> icon="feather" label="Learning style" value={c.style} options={STYLES} onChange={(style) => setContext({ style })} />
    </div>
  );
}

// ── Misc ───────────────────────────────────────
export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center animate-rise">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-2 text-muted">
        <Icon name={icon} size={20} />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function BetaNotice({ onDismiss, className }: { onDismiss?: () => void; className?: string }) {
  return (
    <div className={cx("flex items-start gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3", className)}>
      <span className="badge-beta mt-0.5 shrink-0">BETA</span>
      <p className="text-[13px] leading-relaxed text-muted">
        <span className="font-medium text-ink">OLIS Beta.</span> OLIS is currently in development. Some features are experimental and the
        intelligence layer is still evolving.
      </p>
      {onDismiss && (
        <button className="icon-btn -mr-1.5 -mt-1 h-7 w-7 shrink-0" onClick={onDismiss} aria-label="Dismiss notice">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div>
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
