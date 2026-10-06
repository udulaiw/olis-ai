// ─────────────────────────────────────────────
// OLIS dropdown: a themed replacement for <select>.
//
// Native <select> popups are drawn by the operating system, so on Windows they
// ignore the OLIS theme (white list, faint text on dark mode). This renders the
// list itself, in the theme's surface colours, in a portal (so scrolling chip
// rows and cards never clip it) and positioned under / above the trigger.
//
// Accessibility: button with aria-haspopup="listbox"; the list is role=listbox
// with role=option items, aria-selected, aria-activedescendant. Keyboard:
// ↑/↓/Home/End move, Enter/Space choose, Esc/Tab close, typing jumps to a match.
// ─────────────────────────────────────────────
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { cx } from "../lib/utils";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** Second line under the label (optional). */
  hint?: string;
}

interface Props<T extends string> {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (v: T) => void;
  /** Accessible name (also the tooltip on chips). */
  label: string;
  /** "chip" = compact pill (learning-context bar); "field" = full-width form control. */
  variant?: "chip" | "field";
  icon?: IconName;
  id?: string;
  className?: string;
  /** Rendered before the options (e.g. a short heading). */
  header?: ReactNode;
}

const GAP = 6;
const MAX_H = 320;

export function Dropdown<T extends string>({ value, options, onChange, label, variant = "field", icon, id, className, header }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const uid = useId();
  const listId = `${uid}-list`;
  const current = options.find((o) => o.value === value);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, variant === "chip" ? 220 : r.width);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const below = window.innerHeight - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    // open upward only when there's clearly more room above (e.g. a control near the bottom of a phone screen)
    if (below < Math.min(MAX_H, 200) && above > below) setPos({ left, bottom: window.innerHeight - r.top + GAP, width, maxH: Math.min(MAX_H, above) });
    else setPos({ left, top: r.bottom + GAP, width, maxH: Math.min(MAX_H, below) });
  }, [variant]);

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    place();
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    close();
  };

  // Close on outside click; follow the trigger on resize; close if the page scrolls the trigger away
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (list.current?.contains(e.target as Node)) return; // scrolling inside the list itself
      place();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place]);

  // Keep the highlighted option visible
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKey = (e: KeyboardEvent) => {
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(last, a + 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        return;
      case "Home":
        e.preventDefault();
        setActive(0);
        return;
      case "End":
        e.preventDefault();
        setActive(last);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        return;
      case "Escape":
        e.preventDefault();
        close();
        return;
      case "Tab":
        close(false);
        return;
    }
    // type-ahead: jump to the first option starting with what was typed
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  };

  const trigger =
    variant === "chip" ? (
      <button
        ref={btn}
        id={id}
        type="button"
        title={label}
        aria-label={`${label}: ${current?.label ?? value}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
        className={cx("chip pr-2.5", open && "border-line-strong text-ink", className)}
      >
        {icon && <Icon name={icon} size={14} className="shrink-0 text-faint" />}
        <span className="truncate">{current?.label ?? value}</span>
        <Icon name="chevronDown" size={13} className={cx("shrink-0 text-faint transition-transform duration-200", open && "rotate-180")} />
      </button>
    ) : (
      <button
        ref={btn}
        id={id}
        type="button"
        aria-label={`${label}: ${current?.label ?? value}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
        className={cx("field flex items-center gap-2 text-left", open && "border-accent/60 bg-surface", className)}
      >
        {icon && <Icon name={icon} size={15} className="shrink-0 text-faint" />}
        <span className="min-w-0 flex-1 truncate">{current?.label ?? value}</span>
        <Icon name="chevronDown" size={14} className={cx("shrink-0 text-faint transition-transform duration-200", open && "rotate-180")} />
      </button>
    );

  return (
    <>
      {trigger}
      {open &&
        pos &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${uid}-o${active}`}
            onKeyDown={onKey}
            style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }}
            className="z-[80] overflow-y-auto overscroll-contain rounded-2xl border border-line-strong bg-surface p-1.5 text-sm shadow-pop outline-none animate-pop"
          >
            {header && <li role="presentation" className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wider text-faint">{header}</li>}
            {options.map((o, i) => {
              const selected = o.value === value;
              return (
                <li
                  key={o.value || `__empty${i}`}
                  id={`${uid}-o${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={selected}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={cx(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 transition-colors",
                    i === active ? "bg-surface-3 text-ink" : "text-muted",
                    selected && "text-ink",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate", selected && "font-medium")}>{o.label}</span>
                    {o.hint && <span className="block truncate text-[11.5px] text-faint">{o.hint}</span>}
                  </span>
                  <Icon name="check" size={14} className={cx("shrink-0 text-accent", !selected && "invisible")} />
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}

/** Options from a plain list of strings (label = value). */
export const plainOptions = <T extends string>(values: readonly T[], labels?: Partial<Record<T, string>>): DropdownOption<T>[] => values.map((v) => ({ value: v, label: labels?.[v] ?? v }));
