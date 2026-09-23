import { useEffect, useMemo, useState } from "react";
import { SUBJECTS, type StudyPlan, type Subject } from "../../types";
import { useStore } from "../../store/AppStore";
import { generateStudyPlan, planToMarkdown } from "../../services/olisEngine";
import { load, remove, save } from "../../lib/storage";
import { copyText, cx, daysUntil, toISODate } from "../../lib/utils";
import { Icon } from "../Icon";
import { ConfirmDialog, EmptyState, Spinner } from "../ui";

const KEY = "olis.plan";
const PHASE_STYLE: Record<string, string> = {
  Learn: "bg-accent-soft text-accent",
  Practice: "bg-lavender-soft text-lavender",
  Revise: "bg-surface-3 text-ink",
  "Mock exam": "bg-danger-soft text-danger",
  "Light review": "bg-success-soft text-success",
};
const PHASE_BAR: Record<string, string> = {
  Learn: "bg-accent",
  Practice: "bg-lavender",
  Revise: "bg-muted",
  "Mock exam": "bg-danger",
  "Light review": "bg-success",
};

const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);

export function PlannerTool() {
  const { settings, toast } = useStore();
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISODate(d);
  }, []);
  const [subject, setSubject] = useState<Subject>(settings.context.subject === "General" ? "Physics" : settings.context.subject);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return toISODate(d);
  });
  const [hours, setHours] = useState(3);
  const [topics, setTopics] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ plan: StudyPlan; done: string[] } | null>(() => load(KEY, null));
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (saved) save(KEY, saved);
  }, [saved]);

  const build = async () => {
    const days = daysUntil(date);
    if (!date || Number.isNaN(days)) return setError("Pick your exam date.");
    if (days < 1) return setError("Your exam date needs to be at least tomorrow.");
    if (days > 120) return setError("OLIS Beta plans up to 120 days ahead. Pick a closer date, or plan in stages.");
    setError(null);
    setLoading(true);
    try {
      const res = await generateStudyPlan({
        subject,
        days,
        hoursPerDay: hours,
        topics: topics.split(/\n|,/).map((t) => t.trim()).filter(Boolean),
      });
      setSaved({ plan: res.data, done: [] });
      toast("Study plan ready", "success");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key: string) =>
    setSaved((s) => (s ? { ...s, done: s.done.includes(key) ? s.done.filter((k) => k !== key) : [...s.done, key] } : s));

  const plan = saved?.plan;
  const totalTasks = plan ? plan.schedule.reduce((a, d) => a + d.tasks.filter((t) => t.minutes > 0).length, 0) : 0;
  const doneCount = saved?.done.length ?? 0;
  const todayISO = toISODate(new Date());

  return (
    <div>
      <div className="card grid gap-4 p-5 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Subject</span>
          <select className="field" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
            {SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Exam date</span>
          <input type="date" className="field" min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 flex justify-between text-xs font-medium text-muted">
            Study hours / day <span className="text-ink">{hours}h</span>
          </span>
          <input type="range" min={1} max={10} step={0.5} value={hours} onChange={(e) => setHours(parseFloat(e.target.value))} className="mt-2.5 w-full accent-[var(--c-accent)]" aria-label="Study hours per day" />
        </label>
        <label className="block sm:col-span-3">
          <span className="mb-1.5 block text-xs font-medium text-muted">Topics (optional, one per line or comma-separated)</span>
          <textarea className="field min-h-[72px] resize-y" placeholder="Leave blank to use a standard syllabus outline for this subject" value={topics} onChange={(e) => setTopics(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
          <button className="btn btn-primary !rounded-xl !py-2.5" onClick={() => void build()} disabled={loading}>
            {loading ? <Spinner /> : <Icon name="calendar" size={16} />} {plan ? "Rebuild plan" : "Generate plan"}
          </button>
          {date && daysUntil(date) >= 1 && <span className="text-xs text-faint">{daysUntil(date)} days until your exam</span>}
        </div>
        {error && <p className="text-sm text-danger sm:col-span-3" role="alert">{error}</p>}
      </div>

      <div className="mt-8">
        {!plan ? (
          <EmptyState icon="calendar" title="No plan yet" body="Tell OLIS your exam date and how many hours you can study each day. You'll get a phased, day-by-day schedule you can tick off." />
        ) : (
          <div className="animate-rise">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {plan.days}-day {plan.subject} plan
                </h3>
                <p className="text-sm text-muted">
                  Exam on {fmtDay(plan.examDate)} · {plan.hoursPerDay}h per day · {doneCount}/{totalTasks} tasks done
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  className="btn btn-ghost !px-3"
                  onClick={async () => toast((await copyText(planToMarkdown(plan))) ? "Plan copied as Markdown" : "Couldn't copy", "success")}
                >
                  <Icon name="copy" size={15} /> Copy
                </button>
                <button className="btn btn-ghost !px-3" onClick={() => setConfirmClear(true)}>
                  <Icon name="trash" size={15} /> Clear
                </button>
              </div>
            </div>

            {/* Phase bar */}
            <div className="mb-2 flex h-2 overflow-hidden rounded-full">
              {plan.schedule.map((d) => (
                <div key={d.day} className={cx("h-full flex-1 border-r border-bg last:border-0", PHASE_BAR[d.phase])} title={`Day ${d.day}: ${d.phase}`} />
              ))}
            </div>
            <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              {Array.from(new Set(plan.schedule.map((d) => d.phase))).map((p) => (
                <span key={p} className="flex items-center gap-1.5">
                  <span className={cx("h-2 w-2 rounded-full", PHASE_BAR[p])} /> {p}
                </span>
              ))}
            </div>

            <div className="mb-6 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-success transition-all duration-500" style={{ width: `${totalTasks ? (doneCount / totalTasks) * 100 : 0}%` }} />
            </div>

            <ol className="space-y-3">
              {plan.schedule.map((d) => {
                const isToday = d.date === todayISO;
                return (
                  <li key={d.day} className={cx("card !rounded-2xl p-4", isToday && "!border-accent/50")}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">Day {d.day}</span>
                      <span className="text-xs text-faint">{fmtDay(d.date)}</span>
                      {isToday && <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink">TODAY</span>}
                      <span className={cx("ml-auto rounded-md px-2 py-0.5 text-[11px] font-medium", PHASE_STYLE[d.phase])}>{d.phase}</span>
                    </div>
                    <div className="mb-2 text-[13px] text-muted">{d.focus}</div>
                    <ul className="space-y-1">
                      {d.tasks.map((t, k) => {
                        const key = `${d.day}-${k}`;
                        if (t.minutes === 0) return <li key={key} className="pl-7 text-[13px] text-faint">{t.label}</li>;
                        const checked = saved!.done.includes(key);
                        return (
                          <li key={key}>
                            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1 text-[13px] hover:bg-surface-2">
                              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--c-accent)]" checked={checked} onChange={() => toggle(key)} />
                              <span className={cx("flex-1", checked && "text-faint line-through")}>{t.label}</span>
                              <span className="shrink-0 text-xs text-faint">{mins(t.minutes)}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>

            <div className="card mt-6 p-5">
              <div className="eyebrow mb-3">How to use this plan</div>
              <ul className="space-y-2 text-sm text-muted">
                {plan.tips.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Icon name="check" size={15} className="mt-0.5 shrink-0 text-accent" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear this plan?"
        body="Your schedule and ticked-off tasks will be removed."
        confirmLabel="Clear plan"
        onConfirm={() => {
          setSaved(null);
          remove(KEY);
        }}
        onClose={() => setConfirmClear(false)}
      />
    </div>
  );
}
