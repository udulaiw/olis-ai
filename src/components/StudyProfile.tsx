// Settings → Study profile. Non-sensitive learning preferences, stored only in
// this browser and sent with each question so OLIS can tailor its answers.
import { useState, type KeyboardEvent } from "react";
import { useStore } from "../store/AppStore";
import { Icon } from "./Icon";
import { cx } from "../lib/utils";
import { LANGUAGES, PROFILE_SUBJECTS, STREAMS, type Depth } from "../types";

const DEPTHS: { id: Depth; label: string; hint: string }[] = [
  { id: "quick", label: "Quick", hint: "Key idea + essential steps" },
  { id: "standard", label: "Standard", hint: "Idea, working, done" },
  { id: "deep", label: "Deep", hint: "Full derivations + exam traps" },
];

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium">
        {label}
        {hint && <span className="ml-2 font-normal text-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/** Comma/Enter separated tags, e.g. weak topics. */
function TagInput({ id, values, onChange, placeholder, max = 8 }: { id: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const items = raw
      .split(",")
      .map((s) => s.trim().slice(0, 60))
      .filter(Boolean);
    if (!items.length) return;
    onChange([...values, ...items.filter((i) => !values.some((v) => v.toLowerCase() === i.toLowerCase()))].slice(0, max));
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
  };
  return (
    <div className="field flex flex-wrap items-center gap-1.5 !py-1.5 focus-within:border-line-strong">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-0.5 text-[12.5px]">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="text-faint hover:text-ink">
            <Icon name="x" size={11} strokeWidth={2.2} />
          </button>
        </span>
      ))}
      {values.length < max && (
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => add(draft)}
          placeholder={values.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-faint"
        />
      )}
    </div>
  );
}

export function StudyProfileEditor() {
  const { settings, setProfile } = useStore();
  const p = settings.profile;
  const toggleSubject = (s: string) => setProfile({ subjects: p.subjects.includes(s) ? p.subjects.filter((x) => x !== s) : [...p.subjects, s] });

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="A/L stream" htmlFor="pf-stream">
          <select id="pf-stream" className="field" value={p.stream} onChange={(e) => setProfile({ stream: e.target.value })}>
            {STREAMS.map((s) => (
              <option key={s} value={s}>
                {s || "Not set"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Answer language" htmlFor="pf-lang">
          <div className="segmented w-full" role="group" aria-label="Answer language" id="pf-lang">
            {LANGUAGES.map((l) => (
              <button key={l.id} type="button" className="flex-1 justify-center" aria-pressed={p.language === l.id} onClick={() => setProfile({ language: l.id })}>
                {l.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Subjects">
        <div className="flex flex-wrap gap-2">
          {PROFILE_SUBJECTS.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={p.subjects.includes(s)} onClick={() => toggleSubject(s)}>
              {p.subjects.includes(s) && <Icon name="check" size={13} />}
              {s}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Explanation depth">
        <div className="grid grid-cols-3 gap-2">
          {DEPTHS.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={p.depth === d.id}
              onClick={() => setProfile({ depth: d.id })}
              className={cx("rounded-xl border px-3 py-2.5 text-left transition", p.depth === d.id ? "border-accent/60 bg-accent-soft" : "border-line hover:border-line-strong")}
            >
              <span className="block text-sm font-medium">{d.label}</span>
              <span className="block text-[11.5px] leading-snug text-faint">{d.hint}</span>
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Current topic" htmlFor="pf-topic">
          <input
            id="pf-topic"
            className="field"
            maxLength={80}
            value={p.currentTopic}
            onChange={(e) => setProfile({ currentTopic: e.target.value })}
            placeholder="e.g. Differentiation"
          />
        </Field>
        <Field label="Study goal" htmlFor="pf-goal">
          <input id="pf-goal" className="field" maxLength={200} value={p.goals} onChange={(e) => setProfile({ goals: e.target.value })} placeholder="e.g. A in Physics, 2026 A/L" />
        </Field>
      </div>

      <Field label="Topics I find hard" hint="Enter or comma to add">
        <TagInput id="pf-weak" values={p.weakTopics} onChange={(weakTopics) => setProfile({ weakTopics })} placeholder="e.g. Integration by parts, Electrochemistry" />
      </Field>

      <p className="flex items-start gap-2 text-[12px] leading-relaxed text-faint">
        <Icon name="key" size={14} className="mt-0.5 shrink-0" />
        Saved only in this browser and sent with your questions so OLIS can tailor answers. Don't add personal details like your name, school or contact
        info.
      </p>
    </div>
  );
}
