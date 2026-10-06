// Shared text utilities for the OLIS knowledge base.
// Plain JS (.mjs) so the build-time indexer (scripts/build-index.mjs) and the
// TypeScript server can use the exact same tokenizer and chunker.
import { cleanSinhala } from "./lang/unicode.mjs";
import { stemSinhala } from "./lang/nlp.mjs";

const STOP = new Set(
  (
    "a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those " +
    "there their they them he she his her we our you your i me my not no do does did have has had can could would should will shall " +
    "may might must also into than which who whom what when where why how all any each more most other some such only own same too very " +
    "just about above after again against because before below between both during further here once out over under until up down off while " +
    "explain tell define describe give show please"
  ).split(" "),
);

// Sinhala function words: dropped before stemming so they don't dominate BM25.
const SI_STOP = new Set(["සහ", "හා", "හෝ", "නමුත්", "ඒ", "මේ", "ඒක", "මේක", "ඒකේ", "මේකේ", "යනු", "වන", "වූ", "ද", "කරන්න", "කරමු", "දෙන්න", "එක", "එකක්", "මොකක්ද", "මොකක්", "මොකද", "කොහොමද", "කොහොම", "ඇයි", "කියන්නේ", "කුමක්ද", "කුමක්", "නම්", "තමයි", "තියෙන්නේ", "වෙන්නේ", "ඉතා", "ගැන", "පිළිබඳ", "ඔබ"]);

/**
 * Words for search. Sinhala text is kept in NFC (NFKD would split ො/ෝ/ෞ into
 * separate code points, so what the student types and what the index holds
 * would differ) and light-stemmed so වේගය / වේගයේ / වේගයෙන් all match.
 * @param {string} text @returns {string[]}
 */
export function tokenize(text) {
  const t = cleanSinhala(text)
    // ZWJ only changes how a conjunct is drawn: "ප්‍ර" and "ප්ර" are the same word to a student, so match them equally
    .replace(/\u200D/g, "")
    .toLowerCase()
    .replace(/[\u00C0-\u024F]+/g, (seg) => seg.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")); // fold Latin accents only
  return (t.match(/[a-z0-9]+|[\u0D80-\u0DFF\u200D]+/g) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w) && !SI_STOP.has(w))
    .map((w) => (/[\u0D80-\u0DFF]/.test(w) ? stemSinhala(w) : w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/**
 * Parse optional YAML-ish frontmatter (--- key: value ---).
 * @param {string} src
 * @returns {{ meta: Record<string,string>, body: string }}
 */
export function parseFrontmatter(src) {
  src = src.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"); // Windows line endings / BOM
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: src };
  /** @type {Record<string,string>} */
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { meta, body: src.slice(m[0].length) };
}

// ── Education-aware chunking ────────────────────────────────
// Educational documents are made of units a student asks about as a whole:
// a heading's section, a numbered question with its answer / marking scheme,
// a worked example, a definition. The chunker:
//   1. splits on markdown headings (#–###) into sections,
//   2. inside a section, groups lines into atomic BLOCKS that are never cut:
//      $$…$$ display maths, ``` code, markdown tables, list runs, paragraphs,
//   3. groups blocks into UNITS: a question (Q3, 3., (3), ප්‍රශ්නය 3) and the blocks after it
//      (sub-parts, Answer/Solution/Marking scheme) stay together until the next question,
//   4. packs units into chunks of ~maxChars, splitting an over-long unit only between
//      blocks (an over-long single block is kept whole rather than broken mid-equation),
//   5. tracks [p.N] page markers so every chunk knows the page(s) it came from, even when
//      the marker was on an earlier line.

/** A top-level question start: "Q3", "Question 3", "3.", "3)", "(3)", "ප්‍රශ්නය 3", "**3.**". Sub-parts like (a) or (ii) are not. */
const QUESTION_RE = /^\s*(?:\*\*)?\s*(?:(?:Q(?:uestion)?|ප්\u200D?රශ්නය|ප්\u200D?රශ්න|வினா)\s*\.?\s*(\d{1,3})\b|(\d{1,3})\s*[.)](?!\d)\s+\S|\((\d{1,3})\)\s+\S)/i;
/** Lines that continue the previous question rather than starting new material. */
const ANSWER_RE = /^\s*(?:\*\*)?\s*(?:answer|solution|working|marking scheme|marks?|explanation|පිළිතුර|විසඳුම|ලකුණු|விடை)(?=[\s:.*\-)]|$)/i;
const PAGE_RE = /\[p\.(\d+)\]/g;

/** @param {string} text */
function pagesIn(text) {
  return [...text.matchAll(PAGE_RE)].map((m) => +m[1]);
}

/**
 * Split a section's lines into atomic blocks.
 * @param {string[]} lines
 * @returns {{ text: string, kind: "math"|"code"|"table"|"list"|"para", question?: string, answer?: boolean }[]}
 */
function toBlocks(lines) {
  /** @type {{ text: string, kind: "math"|"code"|"table"|"list"|"para", question?: string, answer?: boolean }[]} */
  const blocks = [];
  let i = 0;
  const startOf = (/** @type {string} */ l) => {
    const m = l.replace(PAGE_RE, "").match(QUESTION_RE);
    return m ? m[1] ?? m[2] ?? m[3] : undefined;
  };
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    // display maths: from a line starting $$ to the line that closes it
    if (/^\s*\$\$/.test(l)) {
      const buf = [l];
      const closedOnSame = (l.match(/\$\$/g) ?? []).length >= 2;
      i++;
      if (!closedOnSame) {
        while (i < lines.length) {
          buf.push(lines[i]);
          if (/\$\$/.test(lines[i++])) break;
        }
      }
      blocks.push({ text: buf.join("\n"), kind: "math" });
      continue;
    }
    if (/^\s*```/.test(l)) {
      const buf = [l];
      i++;
      while (i < lines.length) {
        buf.push(lines[i]);
        if (/^\s*```/.test(lines[i++])) break;
      }
      blocks.push({ text: buf.join("\n"), kind: "code" });
      continue;
    }
    if (/^\s*\|/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) buf.push(lines[i++]);
      blocks.push({ text: buf.join("\n"), kind: "table" });
      continue;
    }
    // paragraph / list: consecutive non-blank lines that aren't the start of another atomic block
    const buf = [l];
    const q = startOf(l);
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(\$\$|```|\|)/.test(lines[i]) && !startOf(lines[i]) && !ANSWER_RE.test(lines[i].replace(PAGE_RE, ""))) buf.push(lines[i++]);
    const text = buf.join("\n");
    blocks.push({ text, kind: /^\s*([-*•]|\d+[.)]|\([a-z0-9]+\))\s/i.test(l) && !q ? "list" : "para", question: q, answer: ANSWER_RE.test(l.replace(PAGE_RE, "")) || undefined });
  }
  return blocks;
}

/**
 * Split a markdown/text document into retrieval chunks of ~maxChars,
 * keeping headings as context so each chunk makes sense on its own.
 * @param {string} body
 * @param {{ title: string, maxChars?: number }} opts
 * @returns {{ heading: string, text: string, pages?: string, question?: string }[]}
 */
export function chunkDocument(body, { title, maxChars = 1100 }) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  /** @type {{ heading: string, lines: string[], page: number | null }[]} */
  const sections = [];
  let cur = { heading: "Overview", lines: /** @type {string[]} */ ([]), page: /** @type {number|null} */ (null) };
  let page = /** @type {number|null} */ (null);
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const h = !inFence && line.match(/^(#{1,3})\s+(.*)/);
    const ps = pagesIn(line);
    if (h) {
      if (ps.length) page = ps[ps.length - 1]; // a marker on a heading line applies to the section it opens
      if (h[1].length === 1) continue; // document title
      sections.push(cur);
      cur = { heading: h[2].replace(PAGE_RE, "").trim(), lines: [], page };
    } else {
      cur.lines.push(line);
      if (ps.length) page = ps[ps.length - 1];
    }
  }
  sections.push(cur);

  /** @type {{ heading: string, text: string, first: number|null, last: number|null, question?: string, hasQ?: boolean }[]} */
  const out = [];
  for (const s of sections) {
    const blocks = toBlocks(s.lines);
    if (!blocks.length) continue;
    // Units: a question owns the blocks after it until the next question; answers always attach to what precedes them
    /** @type {{ blocks: typeof blocks, question?: string }[]} */
    const units = [];
    for (const b of blocks) {
      const last = units[units.length - 1];
      if (b.question) units.push({ blocks: [b], question: b.question });
      else if (last && (last.question || b.answer)) last.blocks.push(b);
      else if (last && !last.question) last.blocks.push(b);
      else units.push({ blocks: [b] });
    }
    // Page tracking across blocks: the page in effect at the start of each block
    let pg = s.page;
    const pageOf = new Map();
    for (const b of blocks) {
      const ps = pagesIn(b.text);
      const start = ps.length && b.text.trimStart().startsWith("[p.") ? ps[0] : pg;
      pageOf.set(b, { first: start, last: ps.length ? ps[ps.length - 1] : start });
      if (ps.length) pg = ps[ps.length - 1];
    }
    // Pack units into chunks; split a too-long unit between blocks; never break a block
    /** @type {{ text: string, first: number|null, last: number|null, question?: string, hasQ: boolean }[]} */
    const packed = [];
    let acc = { text: "", first: /** @type {number|null} */ (null), last: /** @type {number|null} */ (null), question: /** @type {string|undefined} */ (undefined), questions: 0 };
    const push = () => {
      if (acc.text.trim()) packed.push({ text: acc.text.trim(), first: acc.first, last: acc.last, question: acc.questions === 1 ? acc.question : undefined, hasQ: acc.questions > 0 });
      acc = { text: "", first: null, last: null, question: undefined, questions: 0 };
    };
    const add = (/** @type {typeof blocks[number]} */ b, /** @type {string|undefined} */ q) => {
      const p = pageOf.get(b);
      if (acc.first == null) acc.first = p.first;
      acc.last = p.last ?? acc.last;
      if (q && acc.question !== q) ((acc.question = q), acc.questions++);
      acc.text = acc.text ? `${acc.text}\n\n${b.text}` : b.text;
    };
    for (const u of units) {
      const size = u.blocks.reduce((a, b) => a + b.text.length + 2, 0);
      // A whole unit that doesn't fit with what's accumulated starts a new chunk (questions never share a chunk with half of another)
      if (acc.text && acc.text.length + size > maxChars) push();
      for (const b of u.blocks) {
        if (acc.text && acc.text.length + b.text.length > maxChars) push();
        add(b, u.question);
      }
    }
    push();
    for (const c of packed) out.push({ heading: s.heading, ...c });
  }

  // Merge tiny neighbouring sections (no questions) so a heading with one line doesn't become its own weak chunk
  /** @type {typeof out} */
  const merged = [];
  for (const c of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.heading !== c.heading && !prev.hasQ && !c.hasQ && prev.text.length + c.text.length < maxChars * 0.6) {
      prev.text += `\n\n### ${c.heading}\n${c.text}`;
      prev.heading += ` · ${c.heading}`;
      prev.last = c.last ?? prev.last;
      if (prev.first == null) prev.first = c.first;
    } else merged.push({ ...c });
  }
  return merged.map((c) => {
    const pages = c.first == null ? undefined : c.last == null || c.last === c.first ? String(c.first) : `${Math.min(c.first, c.last)}-${Math.max(c.first, c.last)}`;
    return { heading: c.heading, text: `${title} › ${c.heading}\n\n${c.text}`, ...(pages ? { pages } : {}), ...(c.question ? { question: c.question } : {}) };
  });
}
