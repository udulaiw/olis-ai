// Shared text utilities for the OLIS knowledge base.
// Plain JS (.mjs) so the build-time indexer (scripts/build-index.mjs) and the
// TypeScript server can use the exact same tokenizer and chunker.

const STOP = new Set(
  (
    "a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those " +
    "there their they them he she his her we our you your i me my not no do does did have has had can could would should will shall " +
    "may might must also into than which who whom what when where why how all any each more most other some such only own same too very " +
    "just about above after again against because before below between both during further here once out over under until up down off while " +
    "explain tell define describe give show please"
  ).split(" "),
);

/** @param {string} text @returns {string[]} */
export function tokenize(text) {
  return (text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/**
 * Parse optional YAML-ish frontmatter (--- key: value ---).
 * @param {string} src
 * @returns {{ meta: Record<string,string>, body: string }}
 */
export function parseFrontmatter(src) {
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

/**
 * Split a markdown/text document into retrieval chunks of ~maxChars,
 * keeping headings as context so each chunk makes sense on its own.
 * @param {string} body
 * @param {{ title: string, maxChars?: number }} opts
 * @returns {{ heading: string, text: string }[]}
 */
export function chunkDocument(body, { title, maxChars = 1100 }) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  /** @type {{ heading: string, text: string }[]} */
  const sections = [];
  let heading = "Overview";
  let buf = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) sections.push({ heading, text });
    buf = [];
  };
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      if (h[1].length === 1) continue; // document title
      flush();
      heading = h[2].trim();
    } else buf.push(line);
  }
  flush();

  // Merge tiny sections, split huge ones on paragraph boundaries
  /** @type {{ heading: string, text: string }[]} */
  const out = [];
  for (const s of sections) {
    if (s.text.length <= maxChars) {
      const prev = out[out.length - 1];
      if (prev && prev.text.length + s.text.length < maxChars * 0.6) {
        prev.text += `\n\n### ${s.heading}\n${s.text}`;
        prev.heading += ` · ${s.heading}`;
      } else out.push({ ...s });
      continue;
    }
    let cur = "";
    for (const para of s.text.split(/\n{2,}/)) {
      if ((cur + "\n\n" + para).length > maxChars && cur) {
        out.push({ heading: s.heading, text: cur.trim() });
        cur = para;
      } else cur = cur ? cur + "\n\n" + para : para;
    }
    if (cur.trim()) out.push({ heading: s.heading, text: cur.trim() });
  }
  return out.map((c) => ({ heading: c.heading, text: `${title} › ${c.heading}\n\n${c.text}` }));
}
