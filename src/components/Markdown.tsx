import { memo, useMemo, type MouseEvent } from "react";
import { Marked, type Tokens } from "marked";
import katex from "katex";
import { copyText, cx } from "../lib/utils";
import { useStore } from "../store/AppStore";
import type { Source } from "../types";

// ── Safe markdown + math rendering ─────────────
// 1. Pull out code (so $ inside code isn't treated as math)
// 2. Pull out math and render it with KaTeX
// 3. Run markdown (raw HTML is escaped, links are restricted)
// 4. Put math + code back

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      // Never render raw HTML from the model. Allow <br> only (used in tables).
      return text.trim().toLowerCase() === "<br>" ? "<br>" : esc(text);
    },
    link({ href, text }: Tokens.Link) {
      const safe = /^(https?:|mailto:)/i.test(href) ? href : "#";
      return `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    code({ text, lang }: Tokens.Code) {
      const label = (lang || "text").split(/\s/)[0];
      return `<div class="code-block"><div class="code-head"><span>${esc(label)}</span><button type="button" data-copy>Copy</button></div><pre><code>${esc(text)}</code></pre></div>`;
    },
  },
});

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", output: "html" });
  } catch {
    return `<code>${esc(tex)}</code>`;
  }
}

export function renderMarkdown(src: string, sources?: Source[]): string {
  const store: string[] = [];
  const hold = (html: string) => `\uE000${store.push(html) - 1}\uE000`;

  // Protect fenced + inline code from math extraction (kept for marked to render)
  const codeHold: string[] = [];
  let text = src.replace(/```[\s\S]*?(```|$)|`[^`\n]+`/g, (m) => `\u0001${codeHold.push(m) - 1}\u0001`);

  // Display math: $$...$$ and \[...\]
  text = text.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_, a, b) => `\n\n${hold(renderMath((a ?? b).trim(), true))}\n\n`);
  // Inline math: \(...\) and $...$ (not currency like $5 or $ 10)
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, a) => hold(renderMath(a, false)));
  text = text.replace(/(^|[^\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (_, pre, a) => pre + hold(renderMath(a, false)));

  // Citations [1], [2]… → numbered chips linking to the source
  if (sources?.length) {
    const byRef = new Map(sources.map((s) => [s.ref, s]));
    text = text.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => {
      const s = byRef.get(+n);
      if (!s) return m;
      const title = esc(s.title);
      return hold(
        s.url
          ? `<a class="cite" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${title}">${n}</a>`
          : `<button type="button" class="cite" data-cite="${n}" title="${title}">${n}</button>`,
      );
    });
  }

  text = text.replace(/\u0001(\d+)\u0001/g, (_, i) => codeHold[+i]);
  let html = marked.parse(text, { async: false }) as string;
  // Placeholder may have been wrapped in <p> on its own line; that's fine.
  html = html.replace(/\uE000(\d+)\uE000/g, (_, i) => store[+i]);
  return html;
}

export const Markdown = memo(function Markdown({
  content,
  streaming,
  className,
  sources,
}: {
  content: string;
  streaming?: boolean;
  className?: string;
  sources?: Source[];
}) {
  const { toast } = useStore();
  const html = useMemo(() => renderMarkdown(content, sources), [content, sources]);

  const onClick = async (e: MouseEvent<HTMLDivElement>) => {
    const cite = (e.target as HTMLElement).closest<HTMLElement>("button[data-cite]");
    if (cite) {
      const scope = cite.closest("[data-msg]") ?? document;
      const card = scope.querySelector<HTMLElement>(`[data-src-ref="${cite.dataset.cite}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      card?.animate([{ outlineColor: "var(--c-accent)" }, { outlineColor: "transparent" }], { duration: 1200 });
      return;
    }
    const btn = (e.target as HTMLElement).closest("button[data-copy]");
    if (!btn) return;
    const code = btn.closest(".code-block")?.querySelector("code")?.textContent ?? "";
    if (await copyText(code)) {
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    } else toast("Couldn't copy to clipboard", "error");
  };

  return (
    <div
      className={cx("prose-olis", streaming && "stream-caret-last", className)}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
