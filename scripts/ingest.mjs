#!/usr/bin/env node
// ─────────────────────────────────────────────
// OLIS ingest: PDFs / ZIPs of resources → knowledge/**/*.md
//
//   node scripts/ingest.mjs <folder | file.pdf | file.zip> --level ol --subject "Science" [options]
//
//   --level ol|al            exam level (required)
//   --subject "Science"      subject name (required; becomes the folder and frontmatter)
//   --type notes|syllabus|past_paper|marking_scheme|resource   default notes
//   --tier 1..7              source priority (1 official syllabus … 6 notes). Default by type.
//   --source "…"             attribution shown to students, e.g. "Grade 10 Science Teacher's Guide, NIE"
//   --grade 10               optional
//   --ocr                    OCR scanned PDFs (needs tesseract + pdftoppm on PATH; Sinhala needs the "sin" language data)
//   --dry-run                inspect and report only; write nothing
//
// What it does for every file (nothing is uploaded blindly):
//   1. skips exact duplicates (file hash) and re-saved copies (text hash)
//   2. reports corrupt / encrypted PDFs instead of crashing
//   3. detects scanned PDFs (no text layer) and old-font Sinhala PDFs (text extracts as garbage)
//   4. extracts text per page, fixes Sinhala visual-order vowel signs, NFC-normalises, drops running headers/footers
//   5. writes one markdown file per document with [p.N] page markers, so answers can cite "p.12"
//   6. writes knowledge/_ingest-report.json listing what was kept and why anything was not
// Then run `npm run index` (embeddings are added at build time on Vercel).
// ─────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, extname, basename, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { cleanSinhala, repairMojibake, scriptStats, scanText, fixVisualOrder, looksLikeLegacySinhalaFont } from "../server/lang/unicode.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d = "") => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const VALUE_OPTS = new Set(["--level", "--subject", "--type", "--tier", "--source", "--grade"]);
const input = args.find((a, i) => !a.startsWith("--") && !VALUE_OPTS.has(args[i - 1] ?? ""));
const level = { ol: "OL", al: "AL" }[opt("level").toLowerCase()];
const subject = opt("subject");
const type = opt("type", "notes");
if (!input || !level || !subject) {
  console.error('Usage: node scripts/ingest.mjs <folder|file.pdf|file.zip> --level ol|al --subject "Science" [--type notes] [--tier 6] [--source "…"] [--grade 10] [--ocr] [--dry-run]');
  process.exit(1);
}
const DEFAULT_TIER = { syllabus: 1, past_paper: 3, marking_scheme: 4, notes: 6, resource: 6 };
const tier = parseInt(opt("tier")) || DEFAULT_TIER[type] || 6;
const source = opt("source", "OLIS knowledge base");
const grade = opt("grade");
const dry = flag("dry-run");
const wantOcr = flag("ocr");

const ROOT = process.cwd();
const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "doc";
// notes → knowledge/<level>/<subject>/   syllabus → knowledge/<level>/syllabus/<subject>/   papers → knowledge/<level>/past-papers/<subject>/
const sub = type === "syllabus" ? "syllabus" : type === "past_paper" || type === "marking_scheme" ? "past-papers" : "";
const outDir = join(ROOT, "knowledge", level.toLowerCase(), sub, slug(subject));
const sha = (b) => createHash("sha1").update(b).digest("hex");
const which = (cmd) => spawnSync(process.platform === "win32" ? "where" : "which", [cmd]).status === 0;

// ── collect files ───────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "olis-ingest-"));
const pdfs = [];
const skipped = [];
async function collect(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const n of readdirSync(p)) await collect(join(p, n));
    return;
  }
  const ext = extname(p).toLowerCase();
  if (ext === ".pdf") pdfs.push({ path: p, name: basename(p) });
  else if (ext === ".zip") {
    const { unzipSync } = await import("fflate");
    const files = unzipSync(new Uint8Array(readFileSync(p)));
    for (const [name, data] of Object.entries(files)) {
      if (!name.toLowerCase().endsWith(".pdf") || name.includes("__MACOSX")) continue;
      const out = join(tmp, sha(Buffer.from(name + data.length)) + ".pdf");
      writeFileSync(out, data);
      pdfs.push({ path: out, name: basename(name) });
    }
  } else if (ext === ".rar" || ext === ".7z") skipped.push({ file: basename(p), status: "unsupported", reason: `${ext} archives: extract them first (7-Zip) and point this script at the folder` });
  else if ([".md", ".txt"].includes(ext)) skipped.push({ file: basename(p), status: "not_pdf", reason: "already text: copy it into knowledge/ directly" });
}
await collect(resolve(input));

// ── pdf.js ──────────────────────────────────────────────────
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

async function extract(path) {
  const data = new Uint8Array(readFileSync(path));
  const task = pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    // group by visual line (y), then read left→right
    const rows = new Map();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str) continue;
      const y = Math.round(it.transform[5] / 3);
      (rows.get(y) ?? rows.set(y, []).get(y)).push(it);
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => items.sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim());
    pages.push(lines.filter(Boolean));
  }
  await task.destroy();
  return pages; // string[][]
}

function ocr(path) {
  if (!which("tesseract") || !which("pdftoppm")) return { error: "OCR needs tesseract and pdftoppm on PATH" };
  const langs = spawnSync("tesseract", ["--list-langs"], { encoding: "utf8" }).stdout ?? "";
  const lang = langs.includes("sin") ? "sin+eng" : "eng";
  const dir = mkdtempSync(join(tmp, "ocr-"));
  const r = spawnSync("pdftoppm", ["-r", "200", "-png", path, join(dir, "p")]);
  if (r.status !== 0) return { error: "pdftoppm failed" };
  const pages = readdirSync(dir).filter((f) => f.endsWith(".png")).sort().map((f) => {
    const t = spawnSync("tesseract", [join(dir, f), "stdout", "-l", lang], { encoding: "utf8", maxBuffer: 20_000_000 });
    return (t.stdout ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  });
  return { pages, lang };
}

// ── clean-up helpers ────────────────────────────────────────
function dropRunningLines(pages) {
  if (pages.length < 4) return pages;
  const seen = new Map();
  for (const p of pages) for (const l of new Set([...p.slice(0, 2), ...p.slice(-2)])) seen.set(l.replace(/\d+/g, "#"), (seen.get(l.replace(/\d+/g, "#")) ?? 0) + 1);
  const repeated = new Set([...seen].filter(([, c]) => c >= Math.max(3, pages.length * 0.5)).map(([l]) => l));
  return pages.map((p) => p.filter((l, i) => !((i < 2 || i >= p.length - 2) && repeated.has(l.replace(/\d+/g, "#"))) && !/^\d{1,4}$/.test(l)));
}
const HEADING = /^(unit|chapter|lesson|topic|section|competency|ඒකකය|පාඩම|පරිච්ඡේදය|විෂය කරුණු)\b/i;
function pageText(lines, pageNo) {
  const out = [];
  let para = "";
  let marked = false;
  const mark = (t) => (marked ? t : ((marked = true), `[p.${pageNo}] ${t}`)); // the marker rides on the first body paragraph, after any heading
  const flush = () => {
    if (para) out.push(mark(para.trim()));
    para = "";
  };
  for (const l of lines) {
    if (HEADING.test(l) && l.length < 90) {
      flush();
      out.push(`## ${l}`);
    } else if (/^([•\-–*]|\d+[.)]|\([a-z0-9]+\))\s/.test(l)) {
      flush();
      out.push(mark(l));
    } else para = para.endsWith("-") ? para.slice(0, -1) + l : para ? `${para} ${l}` : l;
  }
  flush();
  return out.join("\n\n");
}

// ── run ─────────────────────────────────────────────────────
const report = [...skipped];
const seenFile = new Map();
const seenText = new Map();
if (!dry) mkdirSync(outDir, { recursive: true });

for (const f of pdfs) {
  const bytes = readFileSync(f.path);
  const fileHash = sha(bytes);
  if (seenFile.has(fileHash)) {
    report.push({ file: f.name, status: "duplicate", reason: `identical file to ${seenFile.get(fileHash)}` });
    continue;
  }
  seenFile.set(fileHash, f.name);
  let pages;
  try {
    pages = await extract(f.path);
  } catch (e) {
    report.push({ file: f.name, status: "corrupt", reason: String(e?.message ?? e).slice(0, 120) });
    continue;
  }
  let totalChars = pages.flat().join("").length;
  let usedOcr = null;
  const scanned = totalChars / Math.max(1, pages.length) < 40;
  let sample = pages.flat().join(" ");
  const legacy = !scanned && looksLikeLegacySinhalaFont(sample);
  if (scanned || legacy) {
    if (wantOcr) {
      const r = ocr(f.path);
      if (r.error) {
        report.push({ file: f.name, status: scanned ? "needs_ocr" : "legacy_font", reason: `${scanned ? "no text layer" : "old Sinhala font; text is garbage"}. ${r.error}` });
        continue;
      }
      pages = r.pages;
      usedOcr = r.lang;
      sample = pages.flat().join(" ");
      totalChars = sample.length;
    } else {
      report.push({ file: f.name, status: scanned ? "needs_ocr" : "legacy_font", reason: scanned ? "no text layer (scanned). Re-run with --ocr" : "old Sinhala font (FM Abhaya / Kandy…): text extracts as garbage. Re-run with --ocr (language data: sin)" });
      continue;
    }
  }

  let orderFixes = 0;
  const cleaned = dropRunningLines(pages).map((lines) =>
    lines.map((l) => {
      const m = repairMojibake(l).text;
      const v = fixVisualOrder(cleanSinhala(m));
      orderFixes += v.fixed;
      return v.text;
    }),
  );
  const body = cleaned.map((lines, i) => (lines.length ? pageText(lines, i + 1) : "")).filter(Boolean).join("\n\n");
  const textHash = sha(body.toLowerCase().replace(/\W+/g, ""));
  if (seenText.has(textHash)) {
    report.push({ file: f.name, status: "duplicate", reason: `same text as ${seenText.get(textHash)} (re-saved copy)` });
    continue;
  }
  seenText.set(textHash, f.name);

  const st = scriptStats(body);
  const language = st.sinhala / Math.max(1, st.sinhala + st.latin) > 0.6 ? "si" : st.sinhala > 20 ? "mixed" : st.tamil > st.latin ? "ta" : "en";
  const issues = scanText(body, language === "si" ? "si" : "any");
  const title = f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  const file = join(outDir, `${slug(f.name.replace(/\.pdf$/i, ""))}.md`);
  const fm = [
    "---",
    `title: ${title}`,
    `subject: ${subject}`,
    `level: ${level}`,
    `type: ${type}`,
    `tier: ${tier}`,
    `source: ${source}`,
    grade ? `grade: ${grade}` : null,
    `language: ${language}`,
    `original_file: ${f.name}`,
    `sha1: ${fileHash.slice(0, 12)}`,
    `ingested: ${new Date().toISOString().slice(0, 10)}`,
    usedOcr ? `ocr: ${usedOcr}` : null,
    "verified: false",
    "---",
    "",
    `# ${title}`,
    "",
  ].filter((x) => x !== null);
  if (!dry) writeFileSync(file, fm.join("\n") + "\n" + body + "\n");
  report.push({
    file: f.name,
    status: "ok",
    out: relative(ROOT, file).replace(/\\/g, "/"),
    pages: pages.length,
    chars: body.length,
    language,
    ocr: usedOcr,
    visualOrderFixes: orderFixes || undefined,
    textIssues: issues.length ? issues.map((i) => i.code) : undefined,
  });
}

rmSync(tmp, { recursive: true, force: true });
const counts = report.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
if (!dry) writeFileSync(join(ROOT, "knowledge", "_ingest-report.json"), JSON.stringify({ at: new Date().toISOString(), level, subject, type, tier, counts, files: report }, null, 2));
console.log(`OLIS ingest${dry ? " (dry run)" : ""}: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing found"}`);
for (const r of report.filter((x) => x.status !== "ok")) console.log(`  ✗ ${r.file}: ${r.status} — ${r.reason}`);
for (const r of report.filter((x) => x.status === "ok" && x.textIssues)) console.log(`  ⚠ ${r.file}: check text (${r.textIssues.join(", ")})`);
if (!dry && counts.ok) console.log(`Written to ${relative(ROOT, outDir)}. Review a file or two, then: npm run index`);
