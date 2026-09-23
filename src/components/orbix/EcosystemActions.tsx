// "Connected to your ORBIX ecosystem": what OLIS can do across ORBIX.
// Honest statuses: "Available" works in OLIS today, "Beta" works with limits,
// "Coming to OLIS" is shown but disabled. Nothing pretends to read ORBIX data.
import type { Route } from "../../lib/router";
import { useStore } from "../../store/AppStore";
import { Icon, type IconName } from "../Icon";
import { cx } from "../../lib/utils";
import { StatusTag } from "./bits";
import { DEMO_NOTE, type Status } from "./data";

interface EcoAction {
  id: string;
  label: string;
  body: string;
  icon: IconName;
  status: Status;
}

const ACTIONS: EcoAction[] = [
  { id: "note", label: "Ask OLIS about this note", body: "Attach a note in chat, or try a sample Physics note.", icon: "feather", status: "live" },
  { id: "cards", label: "Turn this topic into flashcards", body: "Builds a revision deck from OLIS notes.", icon: "layers", status: "live" },
  { id: "plan", label: "Create a study plan", body: "Day-by-day sessions up to your exam.", icon: "calendar", status: "live" },
  { id: "paper", label: "Analyse this past paper", body: "Snap a photo of a question: topic, formulae, a hint first.", icon: "image", status: "beta" },
  { id: "weak", label: "Explain my weak topics", body: "Uses the hard topics in your study profile.", icon: "target", status: "live" },
  { id: "task", label: "Add this task to Workspace", body: "Send follow-ups straight to your ORBIX task list.", icon: "tasks", status: "soon" },
];

/** ORBIX apps, and whether OLIS can work with them yet. */
const APPS: { name: string; status: Status }[] = [
  { name: "Notes", status: "beta" },
  { name: "Flashcards", status: "live" },
  { name: "Study Planner", status: "live" },
  { name: "Past Papers", status: "beta" },
  { name: "Calendar", status: "soon" },
  { name: "Tasks", status: "soon" },
  { name: "Progress", status: "soon" },
];

export function EcosystemActions({ navigate, compact }: { navigate: (r: Route) => void; compact?: boolean }) {
  const { send, settings, toast } = useStore();

  const run = (a: EcoAction) => {
    switch (a.id) {
      case "note": {
        const id = send(null, {
          text: "Explain this note for an A/L student. Start with the intuition, then the key equations, then one exam-style question.",
          mode: "explain",
          attachment: { name: `${DEMO_NOTE.title} (sample note)`, text: DEMO_NOTE.text },
        });
        return navigate({ name: "chat", id });
      }
      case "cards":
        return navigate({ name: "tools", tool: "flashcards" });
      case "plan":
        return navigate({ name: "tools", tool: "planner" });
      case "paper":
        toast("Attach a photo of the question with 📎, then ask: “What topic is this testing? Give me a hint first.”");
        return navigate({ name: "chat", id: null });
      case "weak": {
        const weak = settings.profile.weakTopics;
        if (!weak.length) {
          toast("Add the topics you find hard in Settings → Study profile first.");
          return navigate({ name: "settings" });
        }
        const id = send(null, {
          text: `Explain my weak topics: ${weak.join(", ")}. For each: the core idea in two lines, the mistake students usually make, and one practice question (label it as an OLIS practice question).`,
          mode: "explain",
        });
        return navigate({ name: "chat", id });
      }
    }
  };

  return (
    <section aria-labelledby="eco-title" className={cx(!compact && "card overflow-hidden")}>
      <div className={cx("flex flex-wrap items-end justify-between gap-2", compact ? "mb-3" : "border-b border-line px-5 py-4")}>
        <div>
          <h2 id="eco-title" className={cx(compact ? "eyebrow" : "text-[15px] font-semibold")}>
            Connected to your ORBIX ecosystem
          </h2>
          {!compact && <p className="mt-0.5 text-[13px] text-muted">OLIS isn't a separate chatbot. It's the intelligence layer of ORBIX.</p>}
        </div>
        {compact && (
          <button className="text-xs text-muted hover:text-ink" onClick={() => navigate({ name: "orbix" })}>
            How it works
          </button>
        )}
      </div>

      <ul className={cx("grid sm:grid-cols-2", compact ? "card divide-y divide-line overflow-hidden sm:divide-y-0" : "divide-y divide-line sm:divide-y-0")}>
        {ACTIONS.map((a, i) => {
          const disabled = a.status === "soon";
          return (
            <li key={a.id} className={cx("border-line", i % 2 === 0 && "sm:border-r", i < ACTIONS.length - 2 && "sm:border-b")}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => run(a)}
                className="group flex h-full w-full items-start gap-3 px-4 py-3.5 text-left transition enabled:hover:bg-surface-2 disabled:cursor-default"
              >
                <span className={cx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl", disabled ? "bg-surface-2 text-faint" : "bg-accent-soft text-accent")}>
                  <Icon name={a.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cx("text-[13.5px] font-medium", disabled && "text-muted")}>{a.label}</span>
                    <StatusTag status={a.status} compact />
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-faint">{a.body}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-faint", compact ? "mt-3" : "border-t border-line px-5 py-3")}>
        <span>ORBIX apps:</span>
        {APPS.map((x) => (
          <span key={x.name} className="inline-flex items-center gap-1.5">
            <span className={cx("h-1.5 w-1.5 rounded-full", x.status === "live" ? "bg-success" : x.status === "beta" ? "bg-lavender" : "bg-surface-3 ring-1 ring-line")} aria-hidden="true" />
            <span className={x.status === "soon" ? "" : "text-muted"}>{x.name}</span>
            <span className="sr-only">({x.status === "soon" ? "coming soon" : x.status === "beta" ? "beta" : "available"})</span>
          </span>
        ))}
      </div>
    </section>
  );
}
