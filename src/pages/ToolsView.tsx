import type { Route, ToolId } from "../lib/router";
import { PageHeader } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { FlashcardsTool } from "../components/tools/FlashcardsTool";
import { QuizTool } from "../components/tools/QuizTool";
import { PlannerTool } from "../components/tools/PlannerTool";
import { ExplainerTool } from "../components/tools/ExplainerTool";
import { cx } from "../lib/utils";

const TABS: { id: ToolId; label: string; icon: IconName; blurb: string }[] = [
  { id: "flashcards", label: "Flashcards", icon: "layers", blurb: "Create a deck from a topic, then flip and self-grade." },
  { id: "quiz", label: "Quiz", icon: "target", blurb: "Multiple-choice practice with instant explanations." },
  { id: "planner", label: "Study Planner", icon: "calendar", blurb: "A phased, day-by-day schedule to your exam date." },
  { id: "explainer", label: "Concept Explainer", icon: "lightbulb", blurb: "Any concept, adapted to your level and style." },
];

export function ToolsView({ tool, navigate }: { tool: ToolId; navigate: (r: Route) => void }) {
  const active = TABS.find((t) => t.id === tool)!;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader eyebrow="Study Tools" title={active.label} subtitle={active.blurb} />

      <div className="-mx-4 mb-8 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="segmented" role="tablist" aria-label="Study tools">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tool}
              aria-pressed={t.id === tool}
              onClick={() => navigate({ name: "tools", tool: t.id })}
              className={cx("!px-3 sm:!px-3.5")}
            >
              <Icon name={t.icon} size={15} />
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div key={tool} className="animate-rise" role="tabpanel">
        {tool === "flashcards" && <FlashcardsTool />}
        {tool === "quiz" && <QuizTool />}
        {tool === "planner" && <PlannerTool />}
        {tool === "explainer" && <ExplainerTool />}
      </div>
    </div>
  );
}
