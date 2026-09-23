import { useState } from "react";
import { SUBJECTS, type Difficulty, type Quiz, type Subject } from "../../types";
import { useStore } from "../../store/AppStore";
import { generateQuiz } from "../../services/olisEngine";
import { QuizCard } from "../QuizCard";
import { Icon } from "../Icon";
import { EmptyState, Spinner } from "../ui";
import { Orb } from "../Orb";

const DIFFS: (Difficulty | "Mixed")[] = ["Mixed", "Easy", "Medium", "Hard"];

export function QuizTool() {
  const { settings, engine } = useStore();
  const [subject, setSubject] = useState<Subject>(settings.context.subject === "General" ? "Physics" : settings.context.subject);
  const [difficulty, setDifficulty] = useState<Difficulty | "Mixed">("Mixed");
  const [count, setCount] = useState(5);
  const [topic, setTopic] = useState("");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const start = async () => {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const res = await generateQuiz({ subject, difficulty, count, topic: topic.trim() || undefined, context: settings.context }, engine);
      setQuiz(res.data);
      setRunKey((k) => k + 1);
      const notes = [res.fallbackReason];
      if (res.data.questions.length < count) notes.push(`Only ${res.data.questions.length} offline questions match these settings.`);
      setNote(notes.filter(Boolean).join(" ") || null);
    } catch (e) {
      setError((e as Error).message);
      setQuiz(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Subject</span>
          <select className="field" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
            {SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Topic (optional)</span>
          <input className="field" placeholder="e.g. organic, waves, integration" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Difficulty</span>
          <div className="segmented" role="group" aria-label="Difficulty">
            {DIFFS.map((d) => (
              <button key={d} aria-pressed={difficulty === d} onClick={() => setDifficulty(d)}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Questions</span>
          <div className="segmented" role="group" aria-label="Number of questions">
            {[5, 10].map((n) => (
              <button key={n} aria-pressed={count === n} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <button className="btn btn-primary w-full !rounded-xl !py-2.5 sm:w-auto" onClick={() => void start()} disabled={loading}>
            {loading ? <Spinner /> : <Icon name="target" size={16} />} {quiz ? "New quiz" : "Start quiz"}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {error ? (
          <div className="rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</div>
        ) : loading && !quiz ? (
          <div className="card flex h-56 flex-col items-center justify-center gap-4 text-sm text-muted">
            <Orb state="solving" size={64} label="Preparing questions" />
            <span className="shimmer-text">Preparing questions…</span>
          </div>
        ) : quiz ? (
          <QuizCard key={runKey} quiz={quiz} onNewQuiz={() => void start()} />
        ) : (
          <EmptyState icon="target" title="Ready when you are" body="Choose a subject and difficulty, then start. You'll get instant feedback and an explanation after every answer." />
        )}
        {note && <p className="mt-3 text-xs text-faint">{note}</p>}
      </div>
    </div>
  );
}
