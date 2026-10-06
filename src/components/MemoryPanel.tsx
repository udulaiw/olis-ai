import { useState } from "react";
import { useStore } from "../store/AppStore";
import { Icon } from "./Icon";
import { cx } from "../lib/utils";
import type { MemoryItem } from "../types";

const CATEGORY: Record<MemoryItem["category"], string> = {
  education: "Education",
  subjects: "Subjects",
  goals: "Goals",
  preferences: "Preference",
  language: "Language",
  learning_style: "Learning style",
  interests: "Interests",
  general: "Note",
};

/** Settings → OLIS Memory: see, edit, add and clear what OLIS remembers. */
export function MemoryPanel() {
  const { settings, updateSettings, memories, addMemory, updateMemory, removeMemory, clearMemories } = useStore();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const on = settings.memoryEnabled !== false;

  const saveEdit = () => {
    if (editing) updateMemory(editing, editText);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="segmented" role="group" aria-label="OLIS memory">
        <button aria-pressed={on} onClick={() => updateSettings({ memoryEnabled: true })}>
          <Icon name="check" size={15} /> Remember things I tell OLIS
        </button>
        <button aria-pressed={!on} onClick={() => updateSettings({ memoryEnabled: false })}>
          <Icon name="eyeOff" size={15} /> Off
        </button>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        {on
          ? "OLIS saves lasting facts you mention (your exam, stream, subjects, goals, preferred language) and uses only the ones that fit each question. One-off things like “I studied 2 hours today” are not saved. Saved in this browser only."
          : "Memory is off: OLIS won't save anything new or use what's below, and won't look through your earlier chats."}
      </p>

      {memories.length > 0 ? (
        <ul className={cx("divide-y divide-line rounded-xl border border-line", !on && "opacity-60")} aria-label="What OLIS remembers about you">
          {memories.map((m) => (
            <li key={m.key} className="flex items-start gap-3 px-3.5 py-2.5">
              <span className="mt-0.5 shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">{CATEGORY[m.category] ?? "Note"}</span>
              {editing === m.key ? (
                <input
                  autoFocus
                  className="field !py-1 text-[13px]"
                  value={editText}
                  maxLength={200}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  onBlur={saveEdit}
                  aria-label="Edit memory"
                />
              ) : (
                <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">{m.memory}</span>
              )}
              <span className="flex shrink-0 gap-1">
                <button
                  className="icon-btn h-7 w-7"
                  onClick={() => {
                    setEditing(m.key);
                    setEditText(m.memory);
                  }}
                  aria-label={`Edit: ${m.memory}`}
                >
                  <Icon name="pencil" size={13} />
                </button>
                <button className="icon-btn h-7 w-7 hover:!text-danger" onClick={() => removeMemory(m.key)} aria-label={`Forget: ${m.memory}`}>
                  <Icon name="x" size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-muted">
          Nothing saved yet. Try telling OLIS “I’m preparing for the 2027 A/L” or “I prefer Sinhala explanations”.
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addMemory(draft);
          setDraft("");
        }}
      >
        <input className="field" value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} placeholder="Add something OLIS should remember…" aria-label="Add a memory" />
        <button className="btn btn-secondary shrink-0" type="submit" disabled={!draft.trim()}>
          <Icon name="plus" size={15} /> Add
        </button>
      </form>

      {memories.length > 0 &&
        (confirmClear ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted">Forget all {memories.length} memories?</span>
            <button
              className="btn btn-danger !py-1.5"
              onClick={() => {
                clearMemories();
                setConfirmClear(false);
              }}
            >
              Yes, clear memory
            </button>
            <button className="btn btn-ghost !py-1.5" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost !px-0 text-[13px]" onClick={() => setConfirmClear(true)}>
            <Icon name="trash" size={14} /> Clear memory
          </button>
        ))}
    </div>
  );
}
