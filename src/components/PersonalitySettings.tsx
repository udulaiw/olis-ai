// Settings → AI Personality: how OLIS talks (personality), how long answers are
// (response length) and which language it answers in. Stored with the study
// profile in this browser (localStorage) and sent with each question.
import { useStore } from "../store/AppStore";
import { cx } from "../lib/utils";
import { LANGUAGES, PERSONALITIES, PERSONALITY_IDS, RESPONSE_LENGTHS } from "../types";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 text-[13px] font-medium">
      {children}
      {hint && <span className="ml-2 font-normal text-faint">{hint}</span>}
    </div>
  );
}

export function PersonalitySettings() {
  const { settings, setProfile } = useStore();
  const p = settings.profile;
  const current = p.personality ?? "normal";

  return (
    <div className="space-y-6">
      <div>
        <Label hint="Changes tone and teaching approach, never the facts">Personality</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="AI personality">
          {PERSONALITY_IDS.map((id) => {
            const o = PERSONALITIES[id];
            const on = current === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setProfile({ personality: id })}
                className={cx("rounded-xl border px-3 py-2.5 text-left transition", on ? "border-accent/60 bg-accent-soft" : "border-line hover:border-line-strong")}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{o.label}</span>
                  <span className={cx("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border", on ? "border-accent bg-accent" : "border-line-strong")}>
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-faint">{o.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label>Response length</Label>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Response length">
          {RESPONSE_LENGTHS.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={p.depth === d.id}
              onClick={() => setProfile({ depth: d.id })}
              className={cx("rounded-xl border px-3 py-2.5 text-left transition", p.depth === d.id ? "border-accent/60 bg-accent-soft" : "border-line hover:border-line-strong")}
            >
              <span className="block text-sm font-medium">{d.label}</span>
              <span className="block text-[11.5px] leading-snug text-faint">{d.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label hint="Auto answers in the language you write in">Language</Label>
        <div className="segmented w-full" role="group" aria-label="Answer language">
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" className="flex-1 justify-center" aria-pressed={p.language === l.id} onClick={() => setProfile({ language: l.id })}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
