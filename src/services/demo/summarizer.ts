// Extractive summariser — works fully offline.
// Scores each sentence by how many of the text's important words it contains,
// then returns the top sentences in their original order.

const STOP = new Set(
  (
    "a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those " +
    "there their they them he she his her we our you your i me my not no yes do does did done have has had can could would should " +
    "will shall may might must also into than which who whom what when where why how all any each more most other some such only own " +
    "same too very just about above after again against because before below between both during further here once out over under until up down off while"
  ).split(" "),
);

const words = (s: string) => s.toLowerCase().match(/[a-z][a-z'-]{1,}/g) ?? [];

export interface Summary {
  tldr: string;
  points: string[];
  keyTerms: string[];
  wordCount: number;
  readingMinutes: number;
  keptPercent: number;
}

export function summarize(text: string, opts: { maxPoints?: number } = {}): Summary | null {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = (clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length >= 4);
  const totalWords = clean.split(" ").length;
  if (sentences.length < 2 || totalWords < 40) return null;

  const freq = new Map<string, number>();
  for (const w of words(clean)) if (!STOP.has(w) && w.length > 2) freq.set(w, (freq.get(w) ?? 0) + 1);
  const maxF = Math.max(...freq.values());

  const scored = sentences.map((s, i) => {
    const ws = words(s).filter((w) => !STOP.has(w));
    const score = ws.reduce((acc, w) => acc + (freq.get(w) ?? 0) / maxF, 0) / Math.max(4, ws.length ** 0.8);
    const positional = i === 0 ? 0.15 : 0; // first sentences often carry the thesis
    return { s, i, score: score + positional };
  });

  const n = Math.min(opts.maxPoints ?? 6, Math.max(2, Math.round(sentences.length * 0.3)));
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i);
  const tldr = [...scored].sort((a, b) => b.score - a.score)[0].s;

  const keyTerms = [...freq.entries()]
    .filter(([w]) => w.length > 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);

  const keptWords = top.reduce((acc, t) => acc + t.s.split(" ").length, 0);
  return {
    tldr,
    points: top.map((t) => t.s),
    keyTerms,
    wordCount: totalWords,
    readingMinutes: Math.max(1, Math.round(totalWords / 220)),
    keptPercent: Math.round((keptWords / totalWords) * 100),
  };
}

export function summaryToMarkdown(sum: Summary, examFocused = false): string {
  return [
    `## Summary`,
    `> **In one line:** ${sum.tldr}`,
    `### Key points`,
    sum.points.map((p) => `- ${p}`).join("\n"),
    `### Key terms`,
    sum.keyTerms.map((k) => `\`${k}\``).join(" · "),
    examFocused
      ? `### Turn it into revision\n- Make one flashcard per key term.\n- Cover this summary and try to rewrite the key points from memory.`
      : "",
    `*${sum.wordCount} words (~${sum.readingMinutes} min read) condensed to about ${sum.keptPercent}% of the original. OLIS Beta uses extractive summarising offline, so it picks the most important sentences rather than rewriting them.*`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
