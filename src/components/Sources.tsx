import { useState } from "react";
import type { AgentStep, AnswerMeta, Source } from "../types";
import { Icon, type IconName } from "./Icon";
import { Orb, orbForStep } from "./Orb";
import { cx } from "../lib/utils";

const KIND: Record<Source["kind"], { label: string; icon: IconName; cls: string }> = {
  notes: { label: "OLIS notes", icon: "book", cls: "text-accent" },
  paper: { label: "Past paper", icon: "file", cls: "text-accent" },
  document: { label: "Your document", icon: "file", cls: "text-accent" },
  wikipedia: { label: "Wikipedia", icon: "text", cls: "text-lavender" },
  wikidata: { label: "Wikidata", icon: "text", cls: "text-lavender" },
  research: { label: "Research paper", icon: "book", cls: "text-lavender" },
  web: { label: "Web", icon: "search", cls: "text-muted" },
};

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Numbered source cards. Ids match the [n] citations in the answer. */
export function SourceList({ sources, className }: { sources: Source[]; className?: string }) {
  const [open, setOpen] = useState(sources.length <= 3);
  const shown = open ? sources : sources.slice(0, 3);
  return (
    <div className={cx("animate-fade", className)}>
      <div className="mb-2 flex items-center gap-2">
        <span className="eyebrow">Sources</span>
        <span className="text-[11px] text-faint">{sources.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {shown.map((s) => {
          const k = KIND[s.kind];
          const inner = (
            <>
              <span className="mt-0.5 grid h-5 min-w-5 shrink-0 place-items-center rounded-md bg-surface-3 px-1 text-[10px] font-semibold text-muted">{s.ref}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{s.title}</span>
                <span className="flex items-center gap-1 text-[11px] text-faint">
                  <Icon name={k.icon} size={11} className={k.cls} />
                  {s.url ? host(s.url) : k.label}
                </span>
              </span>
              {s.url && <Icon name="arrowRight" size={13} className="mt-1 shrink-0 -rotate-45 text-faint transition group-hover:text-ink" />}
            </>
          );
          const cls = "group flex min-w-0 items-start gap-2.5 rounded-xl border border-line bg-surface/60 px-3 py-2 text-left outline outline-2 outline-transparent transition hover:border-line-strong";
          return s.url ? (
            <a key={s.ref} data-src-ref={s.ref} href={s.url} target="_blank" rel="noopener noreferrer" className={cls} title={s.snippet}>
              {inner}
            </a>
          ) : (
            <div key={s.ref} data-src-ref={s.ref} className={cls} title={s.snippet}>
              {inner}
            </div>
          );
        })}
      </div>
      {sources.length > 3 && (
        <button className="mt-1.5 text-xs text-muted hover:text-ink" onClick={() => setOpen((o) => !o)}>
          {open ? "Show fewer" : `Show all ${sources.length}`}
        </button>
      )}
    </div>
  );
}

/** Live "what the agent is doing" trail. Collapses once the answer arrives. */
export function AgentSteps({ steps, working }: { steps: AgentStep[]; working: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!steps.length) return null;
  const done = steps.filter((s) => s.status !== "running").length;
  if (!working && !expanded) {
    return (
      <button className="mb-2 flex items-center gap-1.5 text-xs text-faint transition hover:text-muted" onClick={() => setExpanded(true)}>
        <Icon name="sparkle" size={13} className="text-accent" />
        Researched in {done} step{done === 1 ? "" : "s"}
        <Icon name="chevronDown" size={12} />
      </button>
    );
  }
  return (
    <div className="mb-3 rounded-xl border border-line bg-surface/50 px-3 py-2.5 animate-fade" role="status" aria-live="polite">
      <ol className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.id} className="flex min-h-5 items-center gap-2 text-[13px]">
            <span className="grid w-5 shrink-0 place-items-center">
              {s.status === "running" ? (
                <Orb state={orbForStep(s.label)} size={20} label={s.label} />
              ) : s.status === "failed" ? (
                <Icon name="alert" size={14} className="text-danger" />
              ) : (
                <Icon name="check" size={14} strokeWidth={2.4} className="text-success" />
              )}
            </span>
            <span className={s.status === "running" ? "shimmer-text" : "text-muted"}>{s.label}</span>
          </li>
        ))}
      </ol>
      {!working && (
        <button className="mt-2 text-xs text-faint hover:text-muted" onClick={() => setExpanded(false)}>
          Hide steps
        </button>
      )}
    </div>
  );
}

const CONFIDENCE: Record<NonNullable<AnswerMeta["confidence"]>, { label: string; dot: string; hint: string }> = {
  confident: { label: "High", dot: "bg-success", hint: "Matched a verified OLIS source" },
  likely: { label: "Medium", dot: "bg-accent", hint: "OLIS sources only partly cover this" },
  uncertain: { label: "Check working", dot: "bg-lavender", hint: "No OLIS source; verify the working yourself" },
  insufficient_source: { label: "No OLIS source", dot: "bg-danger", hint: "Nothing in OLIS confirms this. Treat it as general knowledge" },
};

/** "just now", "4 min ago", "3 h ago", or a date for anything older than a day. */
export function ago(isoTime: string | null | undefined, now = Date.now()): string | null {
  const t = isoTime ? Date.parse(isoTime) : NaN;
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** One quiet line under an answer: what OLIS understood the question to be, and how well it is sourced. */
export function AnswerInsight({ meta, sources, className }: { meta: AnswerMeta; sources?: Source[]; className?: string }) {
  const olis = sources?.filter((s) => s.kind === "notes" || s.kind === "paper").length ?? 0;
  const other = (sources?.length ?? 0) - olis;
  const conf = meta.confidence ? CONFIDENCE[meta.confidence] : null;
  const parts = [
    meta.subjectName,
    meta.topic,
    meta.level === "OL" ? "O/L" : meta.level === "AL" ? "A/L" : null,
    meta.lit?.label ?? null,
  ].filter(Boolean) as string[];
  const live = meta.live;
  const fresh = live?.ok ? ago(live.dataTimestamp) ?? ago(live.retrievedAt) : null;
  const usedContext = (meta.context?.previousChats ?? 0) > 0;
  if (!parts.length && !conf && !live && !usedContext) return null;
  const srcText = [olis ? `${olis} OLIS source${olis > 1 ? "s" : ""}` : "", other ? `${other} web` : ""].filter(Boolean).join(" · ");
  return (
    <div className={cx("animate-fade flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint", className)} aria-label="About this answer">
      {parts.length > 0 && <span className="truncate">{parts.join(" · ")}</span>}
      {srcText && <span>{srcText}</span>}
      {live && (
        <span
          className="inline-flex items-center gap-1.5"
          title={live.ok ? `Retrieved ${new Date(live.retrievedAt).toLocaleString()}${live.dataTimestamp ? ` · data from ${new Date(live.dataTimestamp).toLocaleString()}` : ""}` : "OLIS couldn't reach the live source, so no current figure was given"}
        >
          <span className={cx("h-1.5 w-1.5 rounded-full", live.ok ? "bg-success" : "bg-danger")} aria-hidden />
          {live.ok ? `Live · ${live.source}${fresh ? ` · updated ${fresh}` : ""}` : "Live data unavailable"}
        </span>
      )}
      {usedContext && <span>Used an earlier chat</span>}
      {conf && (
        <span className="inline-flex items-center gap-1.5" title={conf.hint}>
          <span className={cx("h-1.5 w-1.5 rounded-full", conf.dot)} aria-hidden />
          Confidence: {conf.label}
        </span>
      )}
    </div>
  );
}
