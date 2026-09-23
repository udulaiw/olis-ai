import { useState } from "react";
import type { Quiz, QuizProgress } from "../types";
import { Markdown } from "./Markdown";
import { Icon } from "./Icon";
import { cx } from "../lib/utils";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function fresh(quiz: Quiz): QuizProgress {
  return { answers: quiz.questions.map(() => null), current: 0, finished: false };
}

/**
 * Interactive quiz. Controlled when `progress` + `onChange` are given
 * (chat persists it), otherwise keeps its own state (Study Tools).
 */
export function QuizCard({
  quiz,
  progress: controlled,
  onChange,
  onNewQuiz,
}: {
  quiz: Quiz;
  progress?: QuizProgress;
  onChange?: (p: QuizProgress) => void;
  onNewQuiz?: () => void;
}) {
  const [local, setLocal] = useState<QuizProgress>(() => fresh(quiz));
  const p = controlled ?? local;
  const set = (np: QuizProgress) => (onChange ? onChange(np) : setLocal(np));

  const q = quiz.questions[p.current];
  const chosen = p.answers[p.current];
  const answered = chosen !== null && chosen !== undefined;
  const score = p.answers.reduce<number>((acc, a, i) => acc + (a === quiz.questions[i].answer ? 1 : 0), 0);
  const total = quiz.questions.length;

  if (p.finished) {
    const pct = Math.round((score / total) * 100);
    const verdict = pct === 100 ? "Perfect score. Outstanding." : pct >= 80 ? "Excellent work." : pct >= 50 ? "Solid effort. Review the ones you missed." : "Good start. Revisit the explanations, then try again.";
    return (
      <div className="card mt-3 overflow-hidden animate-pop">
        <div className="flex items-center gap-5 p-5">
          <div className="relative grid h-16 w-16 shrink-0 place-items-center">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--c-surface-3)" strokeWidth="3" />
              {pct > 0 && <circle
                cx="18" cy="18" r="15.5" fill="none" stroke="var(--c-accent)" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * 97.4} 97.4`}
                style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)" }}
              />}
            </svg>
            <span className="text-sm font-semibold">{pct}%</span>
          </div>
          <div>
            <div className="text-[15px] font-semibold">{score} / {total} correct</div>
            <p className="text-sm text-muted">{verdict}</p>
          </div>
        </div>
        <div className="border-t border-line px-5 py-3">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {quiz.questions.map((qq, i) => (
              <button
                key={i}
                onClick={() => set({ ...p, current: i, finished: false })}
                className={cx(
                  "grid h-7 w-7 place-items-center rounded-lg text-xs font-medium transition",
                  p.answers[i] === qq.answer ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                )}
                title={`Review question ${i + 1}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={() => set(fresh(quiz))}>
              <Icon name="refresh" size={15} /> Retry quiz
            </button>
            {onNewQuiz && (
              <button className="btn btn-ghost" onClick={onNewQuiz}>
                New quiz
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const choose = (i: number) => {
    if (answered) return;
    const answers = [...p.answers];
    answers[p.current] = i;
    set({ ...p, answers });
  };

  const next = () => {
    if (p.current < total - 1) set({ ...p, current: p.current + 1 });
    else set({ ...p, finished: true });
  };

  return (
    <div className="card mt-3 overflow-hidden animate-pop">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{quiz.title}</div>
          <div className="text-xs text-faint">
            Question {p.current + 1} of {total}
            {q.difficulty && <> · {q.difficulty}</>}
          </div>
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {quiz.questions.map((qq, i) => (
            <span
              key={i}
              className={cx(
                "h-1.5 w-5 rounded-full transition-colors",
                i === p.current ? "bg-ink" : p.answers[i] === null ? "bg-surface-3" : p.answers[i] === qq.answer ? "bg-success" : "bg-danger",
              )}
            />
          ))}
        </div>
      </div>

      <div className="p-5" key={p.current}>
        <Markdown content={q.q} className="animate-fade text-[15px] font-medium" />
        <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Answer options">
          {q.options.map((opt, i) => {
            const isCorrect = i === q.answer;
            const isChosen = i === chosen;
            return (
              <button
                key={i}
                role="radio"
                aria-checked={isChosen}
                disabled={answered}
                onClick={() => choose(i)}
                className={cx(
                  "group flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition",
                  !answered && "border-line hover:border-line-strong hover:bg-surface-2",
                  answered && isCorrect && "border-success/50 bg-success-soft",
                  answered && isChosen && !isCorrect && "border-danger/50 bg-danger-soft",
                  answered && !isCorrect && !isChosen && "border-line opacity-55",
                )}
              >
                <span
                  className={cx(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[11px] font-semibold",
                    answered && isCorrect ? "border-success bg-success text-bg" : answered && isChosen ? "border-danger bg-danger text-bg" : "border-line text-muted",
                  )}
                >
                  {answered && isCorrect ? <Icon name="check" size={13} strokeWidth={3} /> : answered && isChosen ? <Icon name="x" size={13} strokeWidth={3} /> : LETTERS[i]}
                </span>
                <Markdown content={opt} className="!text-sm [&_p]:!m-0" />
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="mt-4 animate-rise">
            <div className={cx("mb-1 text-sm font-semibold", chosen === q.answer ? "text-success" : "text-danger")}>
              {chosen === q.answer ? "Correct" : `Not quite. The answer is ${LETTERS[q.answer]}.`}
            </div>
            <Markdown content={q.explanation} className="!text-sm text-muted" />
            <div className="mt-4 flex justify-end">
              <button className="btn btn-primary" onClick={next} autoFocus>
                {p.current < total - 1 ? "Next question" : "See results"}
                <Icon name="arrowRight" size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
