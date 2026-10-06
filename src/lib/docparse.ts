// ─────────────────────────────────────────────
// Read a study document the student attaches in chat, in the browser.
//
//   PDF   → pdf.js (loaded only when a PDF is attached), page by page, with the
//           same layout rules as the knowledge-base ingest (server/docs/pdflayout.mjs):
//           headings, questions, [p.N] page markers, Sinhala clean-up.
//   DOCX  → word/document.xml → markdown (server/docs/docx.mjs). No page numbers.
//   TXT / MD / CSV / JSON / TEX → as text.
//
// Nothing is uploaded anywhere except with the question to OLIS Cloud, where the
// server picks the passages relevant to each question (server/docs/retrieve.ts).
// ─────────────────────────────────────────────
import { looksLikeLegacySinhalaFont } from "../../server/lang/unicode.mjs";

/** Characters kept per document. Larger files are cut (and the student is told). */
export const MAX_DOC_CHARS = 200_000;
/** Pages read from a PDF. */
export const MAX_PDF_PAGES = 150;
/** Bytes accepted before even trying (a 40 MB scanned PDF would freeze a phone). */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type DocKind = "pdf" | "docx" | "text";
export interface ParsedDoc {
  name: string;
  kind: DocKind;
  text: string;
  /** PDF only: pages read. */
  pages?: number;
  /** Shown as a toast: cut to fit, pages skipped… */
  notes: string[];
}

/** A file OLIS can't read, with a message for the student. */
export class DocError extends Error {}

export const DOC_ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.json,.tex,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*";

export function docKindOf(f: { name: string; type: string }): DocKind | null {
  if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") return "pdf";
  if (/\.docx$/i.test(f.name) || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (/\.(txt|md|markdown|csv|json|tex)$/i.test(f.name) || f.type.startsWith("text/")) return "text";
  return null;
}

function cap(doc: ParsedDoc): ParsedDoc {
  if (doc.text.length <= MAX_DOC_CHARS) return doc;
  // cut at a paragraph boundary so a page marker or equation isn't split
  const cut = doc.text.lastIndexOf("\n\n", MAX_DOC_CHARS);
  const text = doc.text.slice(0, cut > MAX_DOC_CHARS * 0.8 ? cut : MAX_DOC_CHARS);
  const lastPage = [...text.matchAll(/\[p\.(\d+)\]/g)].pop()?.[1];
  return { ...doc, text, notes: [...doc.notes, `Large document: OLIS read the first ${lastPage ? `${lastPage} pages` : `${Math.round(text.length / 1000)}k characters`}.`] };
}

async function readPdf(file: File): Promise<ParsedDoc> {
  const [pdfjs, layout, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("../../server/docs/pdflayout.mjs"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    void task.destroy();
    const name = (e as { name?: string })?.name ?? "";
    if (name === "PasswordException") throw new DocError("That PDF is password-protected. Remove the password (or print it to a new PDF) and attach it again.");
    throw new DocError("OLIS couldn't open that PDF. It may be damaged or not really a PDF.");
  }
  try {
    const total = doc.numPages;
    const n = Math.min(total, MAX_PDF_PAGES);
    const pages: { text: string; size: number }[][] = [];
    let chars = 0;
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const lines = layout.linesFromItems(tc.items as { str?: string; transform: number[]; height?: number }[]);
      pages.push(lines);
      chars += lines.reduce((a, l) => a + l.text.length, 0);
      page.cleanup();
      if (chars > MAX_DOC_CHARS * 1.3) break; // enough text; stop reading
    }
    if (layout.looksScanned(pages))
      throw new DocError("This PDF is scanned images, so there is no text for OLIS to read. Take photos of the pages you need (up to 2) and attach those instead.");
    const sample = pages.flat().slice(0, 400).map((l) => l.text).join(" ");
    if (looksLikeLegacySinhalaFont(sample))
      throw new DocError("This PDF uses an old Sinhala font (FM Abhaya, Kandy…), so its text comes out as random English letters. Attach photos of the pages instead, or a Unicode Sinhala version.");
    const cleaned = layout.dropRunningLines(pages).map((ls) => ls.map((l) => ({ text: layout.cleanLine(l.text).text, size: l.size })));
    const text = layout.pagesToMarkdown(cleaned);
    if (!text.trim()) throw new DocError("That PDF has no readable text.");
    const notes = pages.length < total ? [`OLIS read pages 1–${pages.length} of ${total}.`] : [];
    return cap({ name: file.name, kind: "pdf", text, pages: pages.length, notes });
  } finally {
    void task.destroy();
  }
}

async function readDocx(file: File): Promise<ParsedDoc> {
  const { docxToMarkdown } = await import("../../server/docs/docx.mjs");
  let text: string;
  try {
    text = docxToMarkdown(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new DocError("OLIS couldn't open that Word file. Save it as .docx (not .doc) and try again.");
  }
  if (!text.trim()) throw new DocError("That Word file has no text OLIS can read.");
  return cap({ name: file.name, kind: "docx", text, notes: [] });
}

/** Read an attached document. Throws DocError with a message for the student. */
export async function readDocument(file: File): Promise<ParsedDoc> {
  const kind = docKindOf(file);
  if (!kind) throw new DocError("OLIS reads PDF, Word (.docx), text and Markdown files, plus photos (JPEG, PNG, WebP).");
  if (file.size > MAX_FILE_BYTES) throw new DocError("That file is over 25 MB. Split it, or attach just the chapter you need.");
  if (kind === "pdf") return readPdf(file);
  if (kind === "docx") return readDocx(file);
  const text = (await file.text()).replace(/^﻿/, "");
  if (!text.trim()) throw new DocError("That file looks empty.");
  return cap({ name: file.name, kind: "text", text, notes: [] });
}
