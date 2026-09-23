// "OLIS inside Workspace": a mock ORBIX Workspace board. The actions marked
// Available / Beta really open OLIS with the selected card attached.
import { useState } from "react";
import { Icon } from "../Icon";
import { AIcon } from "../AnimatedIcon";
import { OlisMark } from "../Brand";
import { cx } from "../../lib/utils";
import { ACTIONS, DEMO_NOTE, DEMO_QUESTION, type WorkspaceAction } from "./data";
import { DemoBadge } from "./bits";

type CardId = "note" | "question";
const CARDS = { note: DEMO_NOTE, question: DEMO_QUESTION };

export function WorkspacePreview({ onRun }: { onRun: (a: WorkspaceAction, card: { title: string; text: string }) => void }) {
  const [sel, setSel] = useState<CardId>("note");
  const card = CARDS[sel];

  return (
    <div className="card overflow-hidden">
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
          <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
          <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
        </div>
        <div className="min-w-0 flex-1 truncate text-center text-xs text-muted">
          ORBIX Workspace <span className="text-faint">·</span> Physics revision
        </div>
        <DemoBadge />
      </div>

      {/* Board */}
      <div className="orbix-board grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {(Object.keys(CARDS) as CardId[]).map((id) => {
          const c = CARDS[id];
          const active = sel === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSel(id)}
              aria-pressed={active}
              className={cx(
                "flex h-full flex-col items-start justify-start rounded-2xl border bg-surface p-4 text-left transition-all duration-200",
                active ? "border-accent/60 shadow-[0_0_0_3px_var(--c-accent-soft)]" : "border-line hover:border-line-strong",
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon name={id === "note" ? "feather" : "file"} size={14} className={active ? "text-accent" : "text-faint"} />
                <span className="text-[11px] uppercase tracking-[0.06em] text-faint">{c.subject}</span>
              </div>
              <div className="text-sm font-medium">{c.title}</div>
              <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{c.text}</p>
            </button>
          );
        })}
      </div>

      {/* Ask OLIS bar */}
      <div className="border-t border-line px-4 py-4 sm:px-5">
        <div className="mb-3 flex items-center gap-2">
          <OlisMark size={22} alive="calm" />
          <span className="text-[13px] font-medium">Ask OLIS</span>
          <span className="truncate text-[12px] text-faint">about “{card.title}”</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => {
            const soon = a.status === "soon";
            return (
              <button
                key={a.label}
                type="button"
                disabled={soon}
                onClick={() => onRun(a, card)}
                title={soon ? "Coming to OLIS" : a.status === "beta" ? "Beta: opens OLIS with this card" : "Opens OLIS with this card"}
                className={cx("chip group", soon ? "cursor-not-allowed !border-dashed opacity-60 hover:!text-muted" : "hover:!border-accent/50")}
              >
                {!soon && <AIcon name="sparkles" size={13} className="text-faint transition-colors group-hover:text-accent" />}
                {a.label}
                {a.status === "beta" && <span className="text-[10px] text-lavender">Beta</span>}
                {soon && <span className="text-[10px] text-faint">Soon</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] text-faint">This is a preview board. Actions open a real OLIS chat with the selected card attached.</p>
      </div>
    </div>
  );
}
