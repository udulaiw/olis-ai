import { useRef } from "react";
import type { Route, ToolId } from "../lib/router";
import { useStore, type SendInput } from "../store/AppStore";
import { Composer, type ComposerHandle } from "../components/Composer";
import { BetaNotice, ContextBar } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { OlisLockup } from "../components/Brand";
import { Orb } from "../components/Orb";
import { AIcon, HoverAnimate, type AnimatedIconName } from "../components/AnimatedIcon";
import { relativeTime } from "../lib/utils";
import type { Mode } from "../types";

const TOOLS: { id: ToolId; icon: IconName; anim?: AnimatedIconName; title: string; body: string }[] = [
  { id: "flashcards", icon: "layers", anim: "layers", title: "Flashcards", body: "Turn a topic into a deck" },
  { id: "quiz", icon: "target", title: "Quiz", body: "Test yourself by subject" },
  { id: "planner", icon: "calendar", title: "Study Planner", body: "Map the days to your exam" },
  { id: "explainer", icon: "lightbulb", anim: "lightbulb", title: "Concept Explainer", body: "Any topic, your level" },
];

const TRY: { text: string; mode: Mode }[] = [
  { text: "Explain Newton's laws", mode: "explain" },
  { text: "Solve 2x² − 5x − 3 = 0", mode: "solve" },
  { text: "Who was Marie Curie?", mode: "ask" },
  { text: "I have a physics exam in 10 days", mode: "plan" },
  { text: "How do black holes form?", mode: "ask" },
  { text: "Quiz me on organic chemistry", mode: "quiz" },
];

export function HomeView({ navigate }: { navigate: (r: Route, o?: { replace?: boolean }) => void }) {
  const { send, chats, settings, updateSettings } = useStore();
  const composer = useRef<ComposerHandle>(null);
  const recent = chats.filter((c) => c.messages.length > 0).slice(0, 3);

  const onSend = (input: SendInput) => {
    const id = send(null, input);
    navigate({ name: "chat", id });
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-10 sm:px-6 sm:pt-16">
      {/* Identity */}
      <div className="mb-12 flex items-center justify-between gap-4 animate-rise">
        <div>
          <OlisLockup size="md" alive="full" />
          <p className="mt-4 text-sm text-muted">
            <span className="font-medium text-ink">OLIS AI</span> · Your intelligent learning workspace.
          </p>
        </div>
        <div className="hidden shrink-0 sm:block" aria-hidden="true">
          <Orb state="breathing" size={64} />
        </div>
      </div>

      {/* Prompt */}
      <div className="animate-rise [animation-delay:60ms]">
        <div className="eyebrow mb-3">{greeting}</div>
        <h1 className="text-[32px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[44px]">What are you learning today?</h1>
        <p className="mt-3 text-[15px] text-muted">Ask OLIS to explain, solve, plan, practice, or explore.</p>
      </div>

      <div className="mt-8 animate-rise [animation-delay:120ms]">
        <Composer ref={composer} onSend={onSend} autoFocus variant="hero" />
        <ContextBar className="mt-5 justify-center" />
      </div>

      {/* Try */}
      <div className="mt-10 animate-rise [animation-delay:180ms]">
        <div className="eyebrow mb-3">Try asking</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRY.map((t) => (
            <HoverAnimate key={t.text}>
              <button
                onClick={() => onSend({ text: t.text, mode: t.mode })}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/50 px-4 py-3 text-left text-sm text-muted transition hover:border-line-strong hover:bg-surface hover:text-ink"
              >
                {t.text}
                <AIcon name="arrowRight" size={15} className="shrink-0 text-faint transition-colors group-hover:text-accent" />
              </button>
            </HoverAnimate>
          ))}
        </div>
      </div>

      {/* Continue */}
      {recent.length > 0 && (
        <div className="mt-10 animate-rise [animation-delay:220ms]">
          <div className="mb-3 flex items-center justify-between">
            <div className="eyebrow">Continue learning</div>
            <button className="text-xs text-muted hover:text-ink" onClick={() => navigate({ name: "history" })}>
              View all
            </button>
          </div>
          <div className="card divide-y divide-line overflow-hidden">
            {recent.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate({ name: "chat", id: c.id })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
              >
                <Icon name="history" size={16} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
                <span className="shrink-0 text-xs text-faint">{relativeTime(c.updatedAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tools */}
      <div className="mt-10 animate-rise [animation-delay:260ms]">
        <div className="eyebrow mb-3">Study tools</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TOOLS.map((t) => (
            <HoverAnimate key={t.id}>
            <button
              onClick={() => navigate({ name: "tools", tool: t.id })}
              className="card group flex flex-col items-start gap-3 !rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:border-line-strong"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted transition group-hover:text-accent">
                {t.anim ? <AIcon name={t.anim} size={18} /> : <Icon name={t.icon} size={18} />}
              </span>
              <span>
                <span className="block text-sm font-medium">{t.title}</span>
                <span className="block text-xs text-faint">{t.body}</span>
              </span>
            </button>
            </HoverAnimate>
          ))}
        </div>
      </div>

      {!settings.noticeDismissed && (
        <BetaNotice className="mt-10 animate-rise [animation-delay:300ms]" onDismiss={() => updateSettings({ noticeDismissed: true })} />
      )}
    </div>
  );
}
