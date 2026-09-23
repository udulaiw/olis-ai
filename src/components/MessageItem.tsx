import { memo, useState } from "react";
import type { Message } from "../types";
import { MODE_META } from "../services/intent";
import { useStore } from "../store/AppStore";
import { Markdown } from "./Markdown";
import { QuizCard } from "./QuizCard";
import { Icon, OlisMark } from "./Icon";
import { AIcon, HoverAnimate } from "./AnimatedIcon";
import { Orb, orbForMode, orbForStep } from "./Orb";
import { copyText, cx } from "../lib/utils";
import { AgentSteps, SourceList } from "./Sources";

interface Props {
  chatId: string;
  msg: Message;
  isLastAssistant: boolean;
  busy: boolean;
}

export const MessageItem = memo(function MessageItem({ chatId, msg, isLastAssistant, busy }: Props) {
  const { regenerate, updateQuiz, toast, engine, rate, send } = useStore();
  const [copied, setCopied] = useState(false);

  if (msg.role === "user") {
    return (
      <div className="flex justify-end animate-rise">
        <div className="max-w-[85%] sm:max-w-[75%]">
          {msg.attachment && (
            <div className="mb-1.5 flex justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted">
                <Icon name="file" size={13} /> {msg.attachment.name}
              </span>
            </div>
          )}
          {msg.content && (
            <div className="whitespace-pre-wrap break-words rounded-[20px] rounded-br-md bg-user px-4 py-2.5 text-[15px] leading-relaxed">{msg.content}</div>
          )}
          {msg.mode && msg.mode !== "ask" && <div className="mt-1 text-right text-[11px] text-faint">{MODE_META[msg.mode].label} mode</div>}
        </div>
      </div>
    );
  }

  const streaming = msg.status === "streaming";
  const thinking = msg.status === "thinking";
  const done = msg.status === "done" || msg.status === "stopped" || msg.status === undefined;
  const working = thinking || streaming;
  const runningStep = msg.steps?.find((st) => st.status === "running");
  const orb = streaming ? "composing" : runningStep ? orbForStep(runningStep.label) : orbForMode(msg.mode);
  const thinkingLabel =
    msg.mode === "solve" ? "Working through the problem…" : msg.mode === "plan" ? "Planning your schedule…" : msg.mode === "quiz" ? "Writing your questions…" : msg.mode === "summarize" ? "Reading carefully…" : "Thinking…";

  const copy = async () => {
    let text = msg.content;
    if (msg.quiz) text += "\n\n" + msg.quiz.questions.map((q, i) => `${i + 1}. ${q.q}\n${q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}. ${o}`).join("\n")}`).join("\n\n");
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } else toast("Couldn't copy to clipboard", "error");
  };

  return (
    <div className="group flex gap-3 animate-rise sm:gap-4" data-msg={msg.id}>
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center">
        {working ? <Orb state={orb} size={32} label={runningStep?.label ?? thinkingLabel} /> : <OlisMark size={30} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[13px]">
          <span className="font-semibold">OLIS</span>
          {msg.mode && msg.mode !== "ask" && <span className="text-faint">· {MODE_META[msg.mode].label}</span>}
          {msg.engine === "demo" && engine.kind === "cloud" && <span className="text-faint">· offline engine</span>}
        </div>

        {msg.steps && msg.steps.length > 0 && <AgentSteps steps={msg.steps} working={thinking || streaming} />}

        {thinking && !runningStep && (
          <div className="py-1 text-sm text-muted animate-fade" role="status">
            <span className="shimmer-text">{thinkingLabel}</span>
          </div>
        )}

        {msg.content && <Markdown content={msg.content} streaming={streaming} sources={msg.sources} />}

        {msg.quiz && (
          <QuizCard
            quiz={msg.quiz}
            progress={msg.quizProgress}
            onChange={(p) => updateQuiz(chatId, msg.id, p)}
          />
        )}

        {msg.sources && msg.sources.length > 0 && done && <SourceList sources={msg.sources} className="mt-4" />}

        {msg.status === "error" && (
          <div className="mt-2 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm" role="alert">
            <div className="flex items-start gap-2 text-danger">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              <span>{msg.error || "Something went wrong."}</span>
            </div>
            {isLastAssistant && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-secondary !py-1.5" onClick={() => regenerate(chatId)} disabled={busy}>
                  <Icon name="refresh" size={14} /> Try again
                </button>
                {msg.engine !== "demo" && (
                  <button className="btn btn-ghost !py-1.5" onClick={() => regenerate(chatId, "demo")} disabled={busy}>
                    Answer offline instead
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {done && (msg.content || msg.quiz) && (
          <div
            className={cx(
              "mt-2 flex items-center gap-0.5 transition-opacity",
              isLastAssistant ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100",
            )}
          >
            <HoverAnimate>
              <button className="icon-btn h-8 w-8" onClick={copy} title="Copy response" aria-label="Copy response">
                {copied ? <AIcon name="check" size={15} className="text-success" animate /> : <AIcon name="copy" size={15} />}
              </button>
            </HoverAnimate>
            {isLastAssistant && (
              <HoverAnimate>
                <button className="icon-btn h-8 w-8" onClick={() => regenerate(chatId)} disabled={busy} title="Regenerate response" aria-label="Regenerate response">
                  <AIcon name="regenerate" size={15} />
                </button>
              </HoverAnimate>
            )}
            <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
            <HoverAnimate>
              <button
                className={cx("icon-btn h-8 w-8", msg.feedback === "up" && "!text-success")}
                onClick={() => rate(chatId, msg.id, "up")}
                aria-pressed={msg.feedback === "up"}
                title="Helpful"
                aria-label="Mark as helpful"
              >
                <AIcon name="thumbUp" size={15} />
              </button>
            </HoverAnimate>
            <HoverAnimate>
              <button
                className={cx("icon-btn h-8 w-8", msg.feedback === "down" && "!text-danger")}
                onClick={() => rate(chatId, msg.id, "down")}
                aria-pressed={msg.feedback === "down"}
                title="Not helpful"
                aria-label="Mark as not helpful"
              >
                <AIcon name="thumbDown" size={15} />
              </button>
            </HoverAnimate>
            {msg.status === "stopped" && <span className="ml-2 text-xs text-faint">Stopped</span>}
          </div>
        )}

        {done && isLastAssistant && !busy && msg.suggestions && msg.suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 animate-rise" aria-label="Suggested follow-ups">
            {msg.suggestions.map((sug) => (
              <HoverAnimate key={sug}>
                <button className="chip !text-[12.5px] hover:!border-accent/50" onClick={() => send(chatId, { text: sug, mode: "ask" })}>
                  <AIcon name="sparkles" size={13} className="text-accent" />
                  {sug}
                </button>
              </HoverAnimate>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
