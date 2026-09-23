import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store/AppStore";
import { OlisError, explainConcept } from "../../services/olisEngine";
import { Markdown } from "../Markdown";
import { Icon } from "../Icon";
import { ContextBar, EmptyState } from "../ui";
import { Orb, orbForStep } from "../Orb";
import { copyText, isAbort } from "../../lib/utils";
import type { Source } from "../../types";
import { SourceList } from "../Sources";

const SUGGEST = ["Momentum", "Chemical bonding", "Integration", "Cellular respiration", "Waves", "Acids and bases"];

export function ExplainerTool() {
  const { settings, engine, toast } = useStore();
  const [topic, setTopic] = useState("");
  const [asked, setAsked] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking" | "streaming" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [stepLabel, setStepLabel] = useState("");
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const run = async (t = topic) => {
    const tt = t.trim();
    if (!tt) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setTopic(tt);
    setAsked(tt);
    setText("");
    setError("");
    setSources([]);
    setStepLabel("");
    setStatus("thinking");
    let acc = "";
    try {
      for await (const ev of explainConcept(tt, settings.context, engine, c.signal)) {
        if (ev.type === "text") {
          acc += ev.delta;
          setText(acc);
          setStatus("streaming");
        } else if (ev.type === "sources") setSources(ev.sources);
        else if (ev.type === "step") setStepLabel(ev.status === "running" ? ev.label : "");
      }
      setStatus("done");
    } catch (e) {
      if (isAbort(e)) setStatus(acc ? "done" : "idle");
      else {
        setError(e instanceof OlisError ? e.message : "Something went wrong. Please try again.");
        setStatus("error");
      }
    }
  };

  const busy = status === "thinking" || status === "streaming";

  return (
    <div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input className="field !rounded-xl" placeholder="Any concept, e.g. Momentum" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Concept to explain" />
        {busy ? (
          <button type="button" className="btn btn-secondary !rounded-xl" onClick={() => ctrl.current?.abort()}>
            <Icon name="stop" size={14} /> Stop
          </button>
        ) : (
          <button className="btn btn-primary !rounded-xl" disabled={!topic.trim()}>
            <Icon name="lightbulb" size={16} /> Explain
          </button>
        )}
      </form>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGEST.map((s) => (
          <button key={s} className="chip !py-1 !text-xs" onClick={() => void run(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <ContextBar className="mt-5" />

      <div className="mt-8">
        {status === "idle" ? (
          <EmptyState icon="lightbulb" title="Explain anything" body="OLIS adapts each explanation to your subject, level and learning style. Change them above and ask again to compare." />
        ) : (
          <div className="card p-5 sm:p-7 animate-rise">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="eyebrow truncate">{asked}</span>
              {status === "done" && (
                <div className="flex gap-0.5">
                  <button className="icon-btn h-8 w-8" title="Copy" aria-label="Copy explanation" onClick={async () => toast((await copyText(text)) ? "Copied" : "Couldn't copy", "success")}>
                    <Icon name="copy" size={15} />
                  </button>
                  <button className="icon-btn h-8 w-8" title="Regenerate" aria-label="Regenerate explanation" onClick={() => void run(asked)}>
                    <Icon name="refresh" size={15} />
                  </button>
                </div>
              )}
            </div>
            {status === "thinking" && (
              <div className="flex items-center gap-2.5 text-sm text-muted">
                <Orb state={stepLabel ? orbForStep(stepLabel) : "working"} size={20} />
                <span className="shimmer-text">{stepLabel || "Thinking…"}</span>
              </div>
            )}
            {text && <Markdown content={text} streaming={status === "streaming"} sources={sources} />}
            {sources.length > 0 && status === "done" && <SourceList sources={sources} className="mt-5" />}
            {status === "error" && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
                <Icon name="alert" size={16} /> {error}
                <button className="btn btn-secondary !py-1" onClick={() => void run(asked)}>Try again</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
