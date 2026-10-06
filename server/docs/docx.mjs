// ─────────────────────────────────────────────
// .docx → markdown (headings, paragraphs, lists, tables, equations).
//
// A .docx is a zip; the text is in word/document.xml. This reads that XML with
// small, linear regex passes (no DOM, so it runs in the browser and in Node
// tests) and keeps the structure the chunker needs:
//   Heading 1–3 / Title styles → "#", "##", "###"
//   tables                      → markdown tables (cell text only)
//   Word equations (OMML)       → their linear text in $…$, e.g. $F=ma$
//   list paragraphs             → "- " items
// Page numbers are NOT produced: Word decides pagination when it renders, so a
// .docx has no reliable page to cite. Answers cite the section heading instead.
// Plain JS (.mjs, no Node APIs).
// ─────────────────────────────────────────────
import { unzipSync, strFromU8 } from "fflate";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (/** @type {string} */ s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[/** @type {keyof typeof ENT} */ (e.toLowerCase())] ?? _m,
  );

/**
 * Word equation (OMML) → linear LaTeX-ish text: x^{2}, H_{2}O, \frac{a}{b}, \sqrt{x}.
 * Parses the element tree with a tiny tokenizer (OMML nests, so a flat regex would lose structure).
 */
export function ommlToText(/** @type {string} */ xml) {
  /** @typedef {{ name: string, children: Node[], text?: string }} Node */
  /** @type {Node} */
  const root = { name: "root", children: [] };
  /** @type {Node[]} */
  const stack = [root];
  const re = /<(\/?)([\w:]+)[^>]*?(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) {
      if (top.name === "m:t") top.children.push({ name: "#text", children: [], text: decode(m[4]) });
    } else if (m[1]) {
      if (stack.length > 1) stack.pop();
    } else {
      /** @type {Node} */
      const node = { name: m[2], children: [] };
      top.children.push(node);
      if (!m[3]) stack.push(node);
    }
  }
  const kid = (/** @type {Node} */ n, /** @type {string} */ name) => n.children.find((c) => c.name === name);
  /** @returns {string} */
  const lin = (/** @type {Node | undefined} */ n) => {
    if (!n) return "";
    switch (n.name) {
      case "#text":
        return n.text ?? "";
      case "m:sSup":
        return `${lin(kid(n, "m:e"))}^{${lin(kid(n, "m:sup"))}}`;
      case "m:sSub":
        return `${lin(kid(n, "m:e"))}_{${lin(kid(n, "m:sub"))}}`;
      case "m:sSubSup":
        return `${lin(kid(n, "m:e"))}_{${lin(kid(n, "m:sub"))}}^{${lin(kid(n, "m:sup"))}}`;
      case "m:f":
        return `\\frac{${lin(kid(n, "m:num"))}}{${lin(kid(n, "m:den"))}}`;
      case "m:rad": {
        const deg = lin(kid(n, "m:deg"));
        return `\\sqrt${deg ? `[${deg}]` : ""}{${lin(kid(n, "m:e"))}}`;
      }
      case "m:d":
        return `(${n.children.filter((c) => c.name === "m:e").map(lin).join(", ")})`;
      case "m:rPr":
      case "m:ctrlPr":
      case "m:sSupPr":
      case "m:sSubPr":
      case "m:fPr":
      case "m:radPr":
      case "m:dPr":
      case "w:rPr":
        return "";
      default:
        return n.children.map(lin).join("");
    }
  };
  return lin(root).replace(/\s+/g, " ").trim();
}

/** Text of one paragraph's XML: runs, tabs, breaks and inline equations, in order. */
function paragraphText(/** @type {string} */ xml) {
  let out = "";
  // Walk tokens in document order: equations, text runs, tabs, line breaks
  const re = /<m:oMath\b[\s\S]*?<\/m:oMath>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = re.exec(xml))) {
    const tok = m[0];
    if (tok.startsWith("<m:oMath")) {
      const math = ommlToText(tok);
      if (math) out += ` $${math}$ `;
    } else if (tok.startsWith("<w:t")) out += decode(m[1] ?? "");
    else if (tok.startsWith("<w:tab")) out += "\t";
    else out += "\n";
  }
  return out.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

const styleOf = (/** @type {string} */ xml) => xml.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";

/**
 * word/document.xml → markdown.
 * @param {string} xml
 */
export function docxXmlToMarkdown(xml) {
  const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? xml;
  /** @type {string[]} */
  const out = [];
  // Top-level blocks in order: tables (whole) and paragraphs outside tables
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(body))) {
    const block = m[0];
    if (block.startsWith("<w:tbl")) {
      const rows = [...block.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((r) =>
        [...r[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((c) =>
          [...c[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => paragraphText(p[0])).filter(Boolean).join(" ").replace(/\|/g, "\\|").replace(/\n/g, " "),
        ),
      );
      if (!rows.length) continue;
      const cols = Math.max(...rows.map((r) => r.length));
      const line = (/** @type {string[]} */ r) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? "").join(" | ")} |`;
      out.push([line(rows[0]), `|${" --- |".repeat(cols)}`, ...rows.slice(1).map(line)].join("\n"));
      continue;
    }
    const text = paragraphText(block);
    if (!text) continue;
    const style = styleOf(block).toLowerCase();
    const h = style.match(/^(?:heading|title)(\d?)$/);
    if (h) out.push(`${"#".repeat(Math.min(3, Math.max(2, Number(h[1] || 1) + 1)))} ${text.replace(/\n/g, " ")}`);
    else if (/<w:numPr>/.test(block) || style.startsWith("listparagraph")) out.push(`- ${text}`);
    else out.push(text);
  }
  // Consecutive list items stay together (one blank line between other blocks)
  return out.reduce((acc, b, i) => (i && b.startsWith("- ") && out[i - 1].startsWith("- ") ? `${acc}\n${b}` : acc ? `${acc}\n\n${b}` : b), "");
}

/**
 * .docx bytes → markdown. Throws Error("not_docx") for anything that isn't a Word document.
 * @param {Uint8Array} bytes
 */
export function docxToMarkdown(bytes) {
  /** @type {Record<string, Uint8Array>} */
  let files;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  } catch {
    throw new Error("not_docx");
  }
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("not_docx");
  return docxXmlToMarkdown(strFromU8(doc));
}
