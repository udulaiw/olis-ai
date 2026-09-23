import { useCallback, useEffect, useState } from "react";
import type { Flashcard } from "../../types";
import { useStore } from "../../store/AppStore";
import { generateFlashcards } from "../../services/olisEngine";
import { Markdown } from "../Markdown";
import { Icon } from "../Icon";
import { EmptyState, Spinner } from "../ui";
import { Orb } from "../Orb";
import { cx, shuffle } from "../../lib/utils";

const SUGGEST = ["Newton's laws", "Photosynthesis", "Mole concept", "Differentiation", "Organic chemistry", "DNA replication"];

export function FlashcardsTool() {
  const { settings, engine, toast } = useStore();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [deck, setDeck] = useState<{ title: string; cards: Flashcard[] } | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(false);

  const start = (cards: number[]) => {
    setOrder(cards);
    setI(0);
    setFlipped(false);
    setKnown(new Set());
    setDone(false);
  };

  const generate = async (t = topic) => {
    const tt = t.trim();
    if (!tt) return;
    setTopic(tt);
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const res = await generateFlashcards(tt, settings.context, engine);
      setDeck(res.data);
      setNote(res.fallbackReason ?? null);
      start(res.data.cards.map((_, k) => k));
    } catch (e) {
      setDeck(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const card = deck && order.length ? deck.cards[order[i]] : null;

  const advance = useCallback(
    (knewIt: boolean) => {
      if (!deck) return;
      setKnown((k) => {
        const n = new Set(k);
        if (knewIt) n.add(order[i]);
        else n.delete(order[i]);
        return n;
      });
      if (i < order.length - 1) {
        setI(i + 1);
        setFlipped(false);
      } else setDone(true);
    },
    [deck, i, order],
  );

  // Keyboard: space = flip, → = got it, ← = again
  useEffect(() => {
    if (!card || done) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight" && flipped) advance(true);
      else if (e.key === "ArrowLeft" && flipped) advance(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, done, flipped, advance]);

  return (
    <div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <input className="field !rounded-xl" placeholder="Topic, e.g. Photosynthesis" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Flashcard topic" />
        <button className="btn btn-primary !rounded-xl" disabled={!topic.trim() || loading}>
          {loading ? <Spinner /> : <Icon name="layers" size={16} />} Create deck
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGEST.map((s) => (
          <button key={s} className="chip !py-1 !text-xs" onClick={() => void generate(s)} disabled={loading}>
            {s}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="card flex h-64 flex-col items-center justify-center gap-4 text-sm text-muted">
            <Orb state="shaping" size={64} label="Building your deck" />
            <span className="shimmer-text">Building your deck…</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : !deck || !card ? (
          <EmptyState icon="layers" title="No deck yet" body="Enter a topic above and OLIS will create a set of flashcards. Flip, then mark each card as known or not." />
        ) : done ? (
          <div className="card p-8 text-center animate-pop">
            <div className="text-4xl font-semibold tracking-tight">
              {known.size}<span className="text-faint">/{order.length}</span>
            </div>
            <p className="mt-1 text-sm text-muted">cards you knew in “{deck.title}”</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {known.size < order.length && (
                <button className="btn btn-primary" onClick={() => start(order.filter((k) => !known.has(k)))}>
                  Review {order.length - known.size} missed
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => start(deck.cards.map((_, k) => k))}>
                <Icon name="refresh" size={15} /> Restart deck
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-rise">
            <div className="mb-3 flex items-center justify-between text-xs text-muted">
              <span className="truncate font-medium text-ink">{deck.title}</span>
              <div className="flex items-center gap-2">
                <span>{i + 1} / {order.length}</span>
                <button className="icon-btn h-7 w-7" title="Shuffle" aria-label="Shuffle deck" onClick={() => { start(shuffle(order)); toast("Deck shuffled"); }}>
                  <Icon name="shuffle" size={14} />
                </button>
              </div>
            </div>
            <div className="mb-4 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(i / order.length) * 100}%` }} />
            </div>

            <button
              className="group block w-full [perspective:1400px]"
              onClick={() => setFlipped((f) => !f)}
              aria-label={flipped ? "Show question" : "Show answer"}
            >
              <div
                key={`${order[i]}-${i}`}
                className={cx(
                  "relative h-64 w-full transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] [transform-style:preserve-3d] sm:h-72",
                  flipped && "[transform:rotateY(180deg)]",
                )}
              >
                <div className="card absolute inset-0 flex flex-col items-center justify-center p-8 [backface-visibility:hidden]">
                  <span className="eyebrow absolute left-5 top-4">Question</span>
                  <Markdown content={card.front} className="text-center !text-lg font-medium" />
                  <span className="absolute bottom-4 text-xs text-faint">Tap or press Space to flip</span>
                </div>
                <div className="card absolute inset-0 flex flex-col items-center justify-center bg-surface-2 p-8 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <span className="eyebrow absolute left-5 top-4 !text-accent">Answer</span>
                  <Markdown content={card.back} className="text-center !text-base" />
                </div>
              </div>
            </button>

            <div className={cx("mt-4 grid grid-cols-2 gap-2 transition-opacity", flipped ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!flipped}>
              <button className="btn btn-secondary !rounded-xl !py-3" onClick={() => advance(false)} tabIndex={flipped ? 0 : -1}>
                <Icon name="refresh" size={15} /> Again
              </button>
              <button className="btn btn-accent !rounded-xl !py-3" onClick={() => advance(true)} tabIndex={flipped ? 0 : -1}>
                <Icon name="check" size={15} /> Got it
              </button>
            </div>
            <p className="mt-3 hidden text-center text-[11px] text-faint sm:block">Space to flip · ← Again · → Got it</p>
          </div>
        )}
        {note && !loading && <p className="mt-3 text-xs text-faint">{note}</p>}
      </div>
    </div>
  );
}
