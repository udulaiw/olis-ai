// ─────────────────────────────────────────────
// PDF text → structured markdown with page markers.
//
// Shared by the build-time ingest script (scripts/ingest.mjs, Node) and the
// in-browser document reader (src/lib/docparse.ts), so a PDF uploaded in chat
// and a PDF added to the knowledge base are read the same way.
//
// Input: pdf.js text-content items per page. Output: markdown where
//   - every page's first body paragraph starts with "[p.N]" (N = real PDF page),
//   - lines in a noticeably larger font, or that look like "Unit 3 …" / "Chapter …",
//     become "## " headings,
//   - numbered questions, sub-parts and bullets start their own paragraph,
//   - repeated running headers/footers and bare page numbers are dropped,
//   - Sinhala is NFC-normalised and visual-order vowel signs are fixed,
//   - maths symbols, units and chemical formulae are left exactly as extracted.
// Plain JS (.mjs, no Node APIs) so both runtimes can import it.
// ─────────────────────────────────────────────
import { cleanSinhala, fixVisualOrder, repairMojibake } from "../lang/unicode.mjs";

/**
 * @typedef {{ str?: string, transform: number[], height?: number }} PdfItem
 * @typedef {{ text: string, size: number }} PdfLine
 */

/**
 * Group pdf.js text items into visual lines (same baseline), read left → right, top → bottom.
 * @param {PdfItem[]} items
 * @returns {PdfLine[]}
 */
export function linesFromItems(items) {
  /** @type {Map<number, PdfItem[]>} */
  const rows = new Map();
  for (const it of items) {
    if (typeof it.str !== "string" || !it.str) continue;
    const y = Math.round(it.transform[5] / 3);
    const row = rows.get(y);
    if (row) row.push(it);
    else rows.set(y, [it]);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => {
      row.sort((a, b) => a.transform[4] - b.transform[4]);
      const size = Math.max(...row.map((i) => Math.abs(i.height || i.transform[3] || 0)));
      return { text: row.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim(), size: Math.round(size * 10) / 10 };
    })
    .filter((l) => l.text);
}

/**
 * Drop running headers/footers (same line on most pages, page numbers masked) and bare page numbers.
 * @template {{ text: string }} L
 * @param {L[][]} pages
 * @returns {L[][]}
 */
export function dropRunningLines(pages) {
  const key = (/** @type {string} */ t) => t.replace(/\d+/g, "#");
  const bare = (/** @type {string} */ t) => /^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i.test(t.trim());
  if (pages.length < 4) return pages.map((p) => p.filter((l) => !bare(l.text)));
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const p of pages) for (const t of new Set([...p.slice(0, 2), ...p.slice(-2)].map((l) => key(l.text)))) seen.set(t, (seen.get(t) ?? 0) + 1);
  const repeated = new Set([...seen].filter(([, c]) => c >= Math.max(3, pages.length * 0.5)).map(([t]) => t));
  return pages.map((p) => p.filter((l, i) => !((i < 2 || i >= p.length - 2) && repeated.has(key(l.text))) && !bare(l.text)));
}

const HEADING_WORD = /^(unit|chapter|lesson|topic|section|part|competency|ඒකකය|පාඩම|පරිච්ඡේදය|කොටස|විෂය කරුණු|அலகு|பாடம்|பகுதி)\b/i;
const NEW_PARA = /^([•▪●\-–*]|\d{1,3}[.)](?!\d)|\(\d{1,3}\)|\([a-z]{1,4}\)|[a-z][.)]\s|(Q(uestion)?|ප්\u200Dරශ්නය|ප්රශ්නය)\s*\.?\s*\d|(answer|solution|marking scheme|පිළිතුර|විසඳුම|விடை)(?=[\s:.\-)]|$))/i;

/**
 * pdf.js drops every invisible format character (it skips glyphs whose Unicode is
 * ZWJ/ZWNJ), so Sinhala rakaransaya "්‍ර" and yansaya "්‍ය" come out as "්ර" / "්ය"
 * (wrong shape on screen, and no longer equal to what students type). In Sinhala
 * text a virama directly before ර/ය is the conjunct far more often than an explicit
 * hal, so the ZWJ is put back. Only applied to PDF-extracted text.
 */
export function restoreSinhalaZwj(/** @type {string} */ text) {
  return text.replace(/([\u0D9A-\u0DC6])\u0DCA(?=[\u0DBB\u0DBA])/g, "$1\u0DCA\u200D");
}

/** Clean one extracted line: mojibake, Sinhala NFC + visual order + ZWJ. Returns how many vowel signs were re-ordered. */
export function cleanLine(/** @type {string} */ text) {
  const v = fixVisualOrder(cleanSinhala(restoreSinhalaZwj(repairMojibake(text).text)));
  return { text: v.text, fixed: v.fixed };
}

/**
 * Pages of lines → markdown with [p.N] markers (N = index + firstPage).
 * @param {PdfLine[][]} pages
 * @param {{ firstPage?: number }} [opts]
 */
export function pagesToMarkdown(pages, opts = {}) {
  const first = opts.firstPage ?? 1;
  const sizes = pages.flat().map((l) => l.size).filter((s) => s > 0).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  const isHeading = (/** @type {PdfLine} */ l) =>
    l.text.length < 90 &&
    !/[.,;:]$/.test(l.text) &&
    !/[=+]/.test(l.text) && // an equation in a big font is not a heading
    (HEADING_WORD.test(l.text) || (median > 0 && l.size >= median * 1.25 && /\p{L}{3}/u.test(l.text)));

  const out = [];
  pages.forEach((lines, idx) => {
    if (!lines.length) return;
    const pageNo = idx + first;
    let marked = false;
    let para = "";
    const mark = (/** @type {string} */ t) => (marked ? t : ((marked = true), `[p.${pageNo}] ${t}`));
    const flush = () => {
      if (para.trim()) out.push(mark(para.trim()));
      para = "";
    };
    for (const l of lines) {
      if (isHeading(l)) {
        flush();
        out.push(`## ${marked ? "" : ((marked = true), `[p.${pageNo}] `)}${l.text}`);
      } else if (NEW_PARA.test(l.text)) {
        flush();
        para = l.text;
      } else para = para.endsWith("-") && !para.endsWith(" -") ? para.slice(0, -1) + l.text : para ? `${para} ${l.text}` : l.text;
    }
    flush();
  });
  return out.join("\n\n");
}

/** Average characters per page: below ~40 the PDF is almost certainly scanned images. */
export const looksScanned = (/** @type {PdfLine[][]} */ pages) => pages.flat().reduce((a, l) => a + l.text.length, 0) / Math.max(1, pages.length) < 40;
