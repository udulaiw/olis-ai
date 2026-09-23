// ─────────────────────────────────────────────
// OLIS Demo Solver
// A small symbolic/numeric solver so "Solve" genuinely works offline for
// common A-Level problem types, with step-by-step working:
//   • linear & quadratic equations       • polynomial differentiation
//   • polynomial integration (+definite)  • arithmetic & percentages
//   • SUVAT kinematics                    • F = ma      • V = IR
// Anything else returns null and the engine falls back to a guided
// problem-solving framework.
// ─────────────────────────────────────────────

type Poly = Map<number, number>; // power → coefficient

// ── Number formatting ──────────────────────────
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) < 1e-12) return "0";
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) < 0.01 || Math.abs(n) >= 1e7) return Number(n.toPrecision(4)).toString();
  const r = Math.round(n * 1000) / 1000;
  return String(r);
}

function fraction(n: number): { p: number; q: number } | null {
  for (let q = 1; q <= 60; q++) {
    const p = n * q;
    if (Math.abs(p - Math.round(p)) < 1e-9) return { p: Math.round(p), q };
  }
  return null;
}

/** LaTeX for a number, using a fraction when it's a "nice" rational. */
function tex(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const f = fraction(n);
  if (f && f.q > 1 && f.q <= 12) {
    const sign = f.p < 0 ? "-" : "";
    return `${sign}\\tfrac{${Math.abs(f.p)}}{${f.q}}`;
  }
  return fmt(n);
}

// ── Text → math helpers ────────────────────────
function normalise(s: string): string {
  return s
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/⁴/g, "^4")
    .replace(/\*\*/g, "^");
}

const isMathToken = (tok: string) =>
  tok.length > 0 && /^[\d.a-z^+\-*/()=,]+$/i.test(tok) && !/[a-z]{2,}/i.test(tok) && /[\d a-z=+\-*/^()]/i.test(tok);

/** Longest run of "mathy" whitespace-separated tokens in a sentence. */
function mathRuns(text: string): string[] {
  const raw = normalise(text).split(/\s+/);
  const runs: string[] = [];
  let cur: string[] = [];
  for (const r of raw) {
    const t = r.replace(/^[,;:]+|[.,;:?!]+$/g, "");
    const breaksAfter = /[:;?!]$|[^\d]\.$/.test(r); // "Find x: 3x+5=20" → don't glue "x" onto "3x"
    if (isMathToken(t)) cur.push(t);
    else {
      if (cur.length) runs.push(cur.join(""));
      cur = [];
    }
    if (breaksAfter && cur.length) {
      runs.push(cur.join(""));
      cur = [];
    }
  }
  if (cur.length) runs.push(cur.join(""));
  return runs.filter((r) => /[\d]/.test(r) || /[a-z]/i.test(r));
}

function variableOf(expr: string): string | null {
  const letters = Array.from(new Set(expr.match(/[a-z]/gi) ?? []));
  if (letters.length !== 1) return letters.length === 0 ? "" : null;
  return letters[0];
}

// ── Polynomial parsing ─────────────────────────
function parsePoly(exprIn: string, v: string): Poly | null {
  let expr = normalise(exprIn).replace(/\s+/g, "").replace(/\*/g, "");
  if (!expr) return null;
  if (v) {
    // Students often type x2 for x² — convert when unambiguous
    expr = expr.replace(new RegExp(`${v}(\\d)(?![\\d.])`, "g"), `${v}^$1`);
  }
  const terms = expr.replace(/(?<!\^)(?=[+-])/g, "|").split("|").filter(Boolean);
  const poly: Poly = new Map();
  const re = v
    ? new RegExp(`^([+-]?)(\\d+(?:\\.\\d+)?)?(?:(${v})(?:\\^\\(?(-?\\d+(?:\\.\\d+)?)\\)?)?)?$`)
    : /^([+-]?)(\d+(?:\.\d+)?)()()$/;
  for (const term of terms) {
    const m = term.match(re);
    if (!m) return null;
    const [, sign, num, hasVar, pow] = m;
    if (!num && !hasVar) return null;
    const coef = (sign === "-" ? -1 : 1) * (num ? parseFloat(num) : 1);
    const power = hasVar ? (pow !== undefined && pow !== "" ? parseFloat(pow) : 1) : 0;
    poly.set(power, (poly.get(power) ?? 0) + coef);
  }
  return poly;
}

function polyTex(p: Poly, v: string): string {
  const entries = [...p.entries()].filter(([, c]) => Math.abs(c) > 1e-12).sort((a, b) => b[0] - a[0]);
  if (!entries.length) return "0";
  return entries
    .map(([pow, c], i) => {
      const neg = c < 0;
      const abs = Math.abs(c);
      let body: string;
      if (pow === 0) body = tex(abs);
      else {
        const coef = abs === 1 ? "" : tex(abs);
        const powStr = pow === 1 ? "" : `^{${tex(pow)}}`;
        body = `${coef}${v}${powStr}`;
      }
      if (i === 0) return (neg ? "-" : "") + body;
      return (neg ? " - " : " + ") + body;
    })
    .join("");
}

const paren = (c: number) => (c < 0 ? `(${tex(c)})` : tex(c));
const coefOf = (c: number) => (c === 1 ? "" : c === -1 ? "-" : tex(c));

function termTex(pow: number, c: number, v: string) {
  return polyTex(new Map([[pow, c]]), v);
}

function degree(p: Poly) {
  let d = 0;
  for (const [pow, c] of p) if (Math.abs(c) > 1e-12) d = Math.max(d, pow);
  return d;
}

function evalPoly(p: Poly, x: number) {
  let s = 0;
  for (const [pow, c] of p) s += c * Math.pow(x, pow);
  return s;
}

// ── Solvers ────────────────────────────────────

function solveEquation(text: string): string | null {
  const run = mathRuns(text).find((r) => (r.match(/=/g) ?? []).length === 1);
  if (!run) return null;
  const v = variableOf(run);
  if (!v) return null;
  const [lhsS, rhsS] = run.split("=");
  const lhs = parsePoly(lhsS, v);
  const rhs = parsePoly(rhsS, v);
  if (!lhs || !rhs) return null;

  const p: Poly = new Map(lhs);
  for (const [pow, c] of rhs) p.set(pow, (p.get(pow) ?? 0) - c);
  for (const pow of p.keys()) if (pow < 0 || !Number.isInteger(pow)) return null;
  const d = degree(p);
  const a = p.get(2) ?? 0;
  const b = p.get(1) ?? 0;
  const c = p.get(0) ?? 0;
  const original = `${polyTex(lhs, v)} = ${polyTex(rhs, v)}`;

  if (d === 1) {
    const x = -c / b;
    return [
      `## Solving $${original}$`,
      `**Step 1: Collect all terms on one side**`,
      `$$${polyTex(p, v)} = 0$$`,
      `**Step 2: Isolate $${v}$**`,
      `$$${termTex(1, b, v)} = ${tex(-c)}$$`,
      `**Step 3: Divide by $${tex(b)}$**`,
      `$$${v} = \\frac{${tex(-c)}}{${tex(b)}} = ${tex(x)}$$`,
      `**Check:** substituting $${v} = ${tex(x)}$ into the left side gives $${fmt(evalPoly(lhs, x))}$ and the right side gives $${fmt(evalPoly(rhs, x))}$. ✓`,
      `> **Answer:** $${v} = ${tex(x)}$`,
    ].join("\n\n");
  }

  if (d === 2) {
    const disc = b * b - 4 * a * c;
    const lines = [
      `## Solving $${original}$`,
      `**Step 1: Write it in standard form** $a${v}^2 + b${v} + c = 0$`,
      `$$${polyTex(p, v)} = 0$$`,
      `So $a = ${tex(a)}$, $b = ${tex(b)}$, $c = ${tex(c)}$.`,
      `**Step 2: Find the discriminant**`,
      `$$\\Delta = b^2 - 4ac = (${tex(b)})^2 - 4(${tex(a)})(${tex(c)}) = ${fmt(disc)}$$`,
    ];
    if (disc < -1e-12) {
      const re = -b / (2 * a);
      const im = Math.sqrt(-disc) / (2 * Math.abs(a));
      lines.push(
        `Since $\\Delta < 0$, there are **no real roots**. The curve never crosses the x-axis.`,
        `**Step 3: Complex roots (if your syllabus needs them)**`,
        `$$${v} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} = ${fmt(re)} \\pm ${fmt(im)}i$$`,
        `> **Answer:** no real solutions.`,
      );
      return lines.join("\n\n");
    }
    const sq = Math.sqrt(Math.max(disc, 0));
    const x1 = (-b + sq) / (2 * a);
    const x2 = (-b - sq) / (2 * a);
    const nice = fraction(x1) && fraction(x2) && Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c);
    lines.push(
      disc === 0
        ? `Since $\\Delta = 0$, there is **one repeated root**.`
        : `Since $\\Delta > 0$, there are **two distinct real roots**.`,
      `**Step 3: Apply the quadratic formula**`,
      `$$${v} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} = \\frac{${tex(-b)} \\pm \\sqrt{${fmt(disc)}}}{${tex(2 * a)}}${Number.isInteger(sq) ? ` = \\frac{${tex(-b)} \\pm ${sq}}{${tex(2 * a)}}` : ""}$$`,
      `**Step 4: Calculate each root**`,
      disc === 0 ? `$$${v} = ${tex(x1)}$$` : `$$${v}_1 = ${tex(x1)}, \\qquad ${v}_2 = ${tex(x2)}$$`,
    );
    if (nice && disc > 0) {
      const f1 = fraction(x1)!;
      const f2 = fraction(x2)!;
      const factor = (f: { p: number; q: number }) =>
        `(${f.q === 1 ? "" : f.q}${v} ${f.p < 0 ? "+" : "-"} ${Math.abs(f.p)})`;
      const k = a / (f1.q * f2.q);
      lines.push(
        `**Tip:** it factorises too: $${k === 1 ? "" : tex(k)}${factor(f1)}${factor(f2)} = 0$. Factorising is faster when you can spot it.`,
      );
    }
    lines.push(
      `**Check:** $${polyTex(p, v).replace(new RegExp(v, "g"), `(${fmt(x1)})`)} = ${fmt(evalPoly(p, x1))}$ ✓`,
      `> **Answer:** ${disc === 0 ? `$${v} = ${tex(x1)}$` : `$${v} = ${tex(x1)}$ or $${v} = ${tex(x2)}$`}`,
    );
    return lines.join("\n\n");
  }
  return null;
}

function extractAfter(text: string, re: RegExp): string | null {
  const m = normalise(text).match(re);
  if (!m) return null;
  let rest = normalise(text).slice((m.index ?? 0) + m[0].length);
  rest = rest
    .replace(/with respect to [a-z]/i, " ")
    .replace(/(from|between)\s*-?[\d.]+\s*(to|and)\s*-?[\d.]+/i, " ")
    .replace(/\bd[a-z]\b/gi, " ");
  const runs = mathRuns(rest);
  if (!runs.length) return null;
  let expr = runs[0];
  if (expr.includes("=")) expr = expr.split("=").pop()!;
  return expr;
}

function differentiate(text: string): string | null {
  const expr = extractAfter(text, /(differentiate|derivative of|d\/d[a-z]\s*(of)?|find d[a-z]\/d[a-z]\s*(of|for)?)/i);
  if (!expr) return null;
  const v = variableOf(expr) || "x";
  const p = parsePoly(expr, v);
  if (!p) return null;
  const d: Poly = new Map();
  const stepsTerms: string[] = [];
  for (const [pow, c] of [...p.entries()].sort((a, b) => b[0] - a[0])) {
    if (Math.abs(c) < 1e-12) continue;
    if (pow === 0) {
      stepsTerms.push(`- $\\frac{d}{d${v}}\\left(${tex(c)}\\right) = 0$ (a constant has zero gradient)`);
      continue;
    }
    const nc = c * pow;
    d.set(pow - 1, (d.get(pow - 1) ?? 0) + nc);
    stepsTerms.push(
      `- $\\frac{d}{d${v}}\\left(${termTex(pow, c, v)}\\right) = ${tex(pow)} \\times ${paren(c)}${v}^{${tex(pow)} - 1} = ${termTex(pow - 1, nc, v)}$`,
    );
  }
  const f = polyTex(p, v);
  return [
    `## Differentiating $y = ${f}$`,
    `**Rule:** the power rule, $\\dfrac{d}{d${v}}\\left(a${v}^n\\right) = na${v}^{n-1}$. Differentiate **term by term**.`,
    `**Step 1: Differentiate each term**`,
    stepsTerms.join("\n"),
    `**Step 2: Combine**`,
    `$$\\frac{dy}{d${v}} = ${polyTex(d, v)}$$`,
    degree(p) >= 2 && Number.isInteger(degree(p))
      ? `**Next step (if asked for stationary points):** set $\\frac{dy}{d${v}} = 0$ and solve for $${v}$.`
      : "",
    `> **Answer:** $\\dfrac{dy}{d${v}} = ${polyTex(d, v)}$`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function integrate(text: string): string | null {
  const expr = extractAfter(text, /(integrate|integral of|∫)/i);
  if (!expr) return null;
  const v = variableOf(expr) || "x";
  const p = parsePoly(expr, v);
  if (!p) return null;
  const I: Poly = new Map();
  let hasLn = 0;
  const lines: string[] = [];
  for (const [pow, c] of [...p.entries()].sort((a, b) => b[0] - a[0])) {
    if (Math.abs(c) < 1e-12) continue;
    if (pow === -1) {
      hasLn += c;
      lines.push(`- $\\int ${termTex(-1, c, v)}\\,d${v} = ${tex(c)}\\ln\\lvert ${v}\\rvert$`);
      continue;
    }
    const nc = c / (pow + 1);
    I.set(pow + 1, (I.get(pow + 1) ?? 0) + nc);
    lines.push(
      `- $\\int ${termTex(pow, c, v)}\\,d${v} = \\frac{${coefOf(c)}${v}^{${tex(pow + 1)}}}{${tex(pow + 1)}} = ${termTex(pow + 1, nc, v)}$`,
    );
  }
  const lnTex = hasLn ? `${hasLn < 0 ? " - " : " + "}${tex(Math.abs(hasLn)) === "1" ? "" : tex(Math.abs(hasLn))}\\ln\\lvert ${v}\\rvert` : "";
  const F = polyTex(I, v) + lnTex;
  const out = [
    `## Integrating $${polyTex(p, v)}$`,
    `**Rule:** $\\displaystyle\\int a${v}^n\\,d${v} = \\frac{a${v}^{n+1}}{n+1} + C$ for $n \\neq -1$. Increase the power by 1, then divide by the new power.`,
    `**Step 1: Integrate each term**`,
    lines.join("\n"),
    `**Step 2: Combine**`,
    `$$\\int \\left(${polyTex(p, v)}\\right)d${v} = ${F} + C$$`,
  ];
  const lim = normalise(text).match(/(?:from|between)\s*(-?[\d.]+)\s*(?:to|and)\s*(-?[\d.]+)/i);
  if (lim) {
    const lo = parseFloat(lim[1]);
    const hi = parseFloat(lim[2]);
    const Fx = (x: number) => evalPoly(I, x) + (hasLn ? hasLn * Math.log(Math.abs(x)) : 0);
    if (hasLn && lo <= 0 && hi >= 0) return out.join("\n\n");
    const val = Fx(hi) - Fx(lo);
    out.push(
      `**Step 3: Apply the limits** $${fmt(lo)}$ to $${fmt(hi)}$`,
      `$$\\Big[${F}\\Big]_{${fmt(lo)}}^{${fmt(hi)}} = (${fmt(Fx(hi))}) - (${fmt(Fx(lo))}) = ${fmt(val)}$$`,
      val < 0 ? `A negative value means more of the area lies **below** the x-axis.` : "",
      `> **Answer:** $\\displaystyle\\int_{${fmt(lo)}}^{${fmt(hi)}} \\left(${polyTex(p, v)}\\right)d${v} = ${fmt(val)}$`,
    );
  } else {
    out.push(`Don't forget the **constant of integration** $C$. It's a common lost mark.`, `> **Answer:** $${F} + C$`);
  }
  return out.filter(Boolean).join("\n\n");
}

// Safe arithmetic evaluator (recursive descent, no eval)
function evaluate(src: string): number | null {
  const s = normalise(src).replace(/\s+/g, "");
  let i = 0;
  const peek = () => s[i];
  function num(): number {
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new Error("paren");
      i++;
      return v;
    }
    if (s.startsWith("sqrt", i)) {
      i += 4;
      return Math.sqrt(num());
    }
    if (peek() === "-") {
      i++;
      return -num();
    }
    if (peek() === "+") {
      i++;
      return num();
    }
    const m = s.slice(i).match(/^\d+(?:\.\d+)?/);
    if (!m) throw new Error("num");
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function power(): number {
    const b = num();
    if (peek() === "^") {
      i++;
      return Math.pow(b, power());
    }
    return b;
  }
  function term(): number {
    let v = power();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const r = power();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  try {
    const v = expr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

function arithmetic(text: string): string | null {
  const pct = text.match(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/i);
  if (pct) {
    const p = parseFloat(pct[1]);
    const n = parseFloat(pct[2]);
    const r = (p / 100) * n;
    return [
      `## ${fmt(p)}% of ${fmt(n)}`,
      `**Step 1:** Convert the percentage to a decimal: $${fmt(p)}\\% = \\frac{${fmt(p)}}{100} = ${fmt(p / 100)}$`,
      `**Step 2:** Multiply: $${fmt(p / 100)} \\times ${fmt(n)} = ${fmt(r)}$`,
      `> **Answer:** ${fmt(r)}`,
    ].join("\n\n");
  }
  const candidates = (normalise(text).match(/[\d.()+\-*/^\s]*(?:sqrt)?[\d.()+\-*/^\s]+/g) ?? [])
    .map((c) => c.trim())
    .filter((c) => /\d/.test(c) && /\d\s*[+\-*/^]\s*[\d(-]/.test(c));
  if (!candidates.length) return null;
  const exprS = candidates.sort((a, b) => b.length - a.length)[0];
  const val = evaluate(exprS);
  if (val === null) return null;
  const pretty = exprS.replace(/\*/g, " \\times ").replace(/\//g, " \\div ");
  return [
    `## Calculating $${pretty}$`,
    `Work in **BODMAS/BIDMAS** order: brackets → indices (powers) → division and multiplication (left to right) → addition and subtraction (left to right).`,
    `$$${pretty} = ${fmt(val)}$$`,
    `> **Answer:** ${fmt(val)}`,
  ].join("\n\n");
}

// ── Physics formula solvers ────────────────────
type Vars = Record<string, number>;

function grab(text: string, patterns: [string, RegExp, number?][]): Vars {
  const out: Vars = {};
  for (const [name, re, mult] of patterns) {
    if (out[name] !== undefined) continue;
    const m = text.match(re);
    if (m) {
      const g = m.slice(1).find((x) => x !== undefined);
      out[name] = g === undefined ? 0 : parseFloat(g) * (mult ?? 1);
    }
  }
  return out;
}

const NUM = "(-?\\d+(?:\\.\\d+)?)";

function suvat(textIn: string): string | null {
  const text = normalise(textIn);
  const k: Vars = grab(text, [
    ["s", new RegExp(`\\bs\\s*=\\s*${NUM}`)],
    ["u", new RegExp(`\\bu\\s*=\\s*${NUM}`)],
    ["v", new RegExp(`\\bv\\s*=\\s*${NUM}`)],
    ["a", new RegExp(`\\ba\\s*=\\s*${NUM}`)],
    ["t", new RegExp(`\\bt\\s*=\\s*${NUM}`)],
    ["u", /from rest|starts? (?:from )?rest|is dropped|released from rest/i, 0],
    ["v", /comes? to (?:a )?(?:rest|stop)|brought to rest|stops/i, 0],
    ["a", new RegExp(`accelerat\\w*\\s*(?:uniformly\\s*)?(?:at|of)\\s*${NUM}`, "i")],
    ["a", new RegExp(`decelerat\\w*\\s*(?:uniformly\\s*)?(?:at|of)\\s*${NUM}`, "i"), -1],
    ["u", new RegExp(`initial (?:velocity|speed)\\s*(?:of|is)?\\s*${NUM}`, "i")],
    ["v", new RegExp(`final (?:velocity|speed)\\s*(?:of|is)?\\s*${NUM}`, "i")],
    ["t", new RegExp(`(?:for|in|after|takes)\\s*${NUM}\\s*(?:s\\b|sec|seconds)`, "i")],
    ["s", new RegExp(`(?:travels|distance of|covers|over|through)\\s*${NUM}\\s*m\\b(?!\\s*\\/)`, "i")],
  ]);
  const known = Object.keys(k);
  if (known.length < 3) return null;
  const all = ["s", "u", "v", "a", "t"];
  const unknown = all.filter((x) => !known.includes(x));
  if (unknown.length === 0) return null;

  const names: Record<string, string> = { s: "displacement", u: "initial velocity", v: "final velocity", a: "acceleration", t: "time" };
  const units: Record<string, string> = { s: "\\text{m}", u: "\\text{m s}^{-1}", v: "\\text{m s}^{-1}", a: "\\text{m s}^{-2}", t: "\\text{s}" };
  const lines: string[] = [
    `## SUVAT problem`,
    `**Step 1: List what you know**`,
    all.map((x) => `- $${x}$ (${names[x]}) = ${known.includes(x) ? `$${fmt(k[x])}\\ ${units[x]}$` : "**?**"}`).join("\n"),
  ];

  const vals: Vars = { ...k };
  const solveFor = (x: string, exclude: string): { eq: string; working: string; val: number } | null => {
    const { s, u, v, a, t } = vals;
    const quad = (A: number, B: number, C: number): number | null => {
      if (Math.abs(A) < 1e-12) return Math.abs(B) < 1e-12 ? null : -C / B;
      const D = B * B - 4 * A * C;
      if (D < 0) return null;
      const r = [(-B + Math.sqrt(D)) / (2 * A), (-B - Math.sqrt(D)) / (2 * A)].filter((z) => z >= 0).sort((p, q) => p - q);
      return r.length ? r[0] : null;
    };
    switch (exclude) {
      case "s": // v = u + at
        if (x === "v") return { eq: "v = u + at", working: `v = ${fmt(u)} + (${fmt(a)})(${fmt(t)})`, val: u + a * t };
        if (x === "u") return { eq: "u = v - at", working: `u = ${fmt(v)} - (${fmt(a)})(${fmt(t)})`, val: v - a * t };
        if (x === "a") return { eq: "a = \\dfrac{v - u}{t}", working: `a = \\dfrac{${fmt(v)} - ${fmt(u)}}{${fmt(t)}}`, val: (v - u) / t };
        if (x === "t") return { eq: "t = \\dfrac{v - u}{a}", working: `t = \\dfrac{${fmt(v)} - ${fmt(u)}}{${fmt(a)}}`, val: (v - u) / a };
        break;
      case "v": // s = ut + ½at²
        if (x === "s") return { eq: "s = ut + \\tfrac12 at^2", working: `s = (${fmt(u)})(${fmt(t)}) + \\tfrac12(${fmt(a)})(${fmt(t)})^2`, val: u * t + 0.5 * a * t * t };
        if (x === "u") return { eq: "u = \\dfrac{s - \\tfrac12 at^2}{t}", working: `u = \\dfrac{${fmt(s)} - \\tfrac12(${fmt(a)})(${fmt(t)})^2}{${fmt(t)}}`, val: (s - 0.5 * a * t * t) / t };
        if (x === "a") return { eq: "a = \\dfrac{2(s - ut)}{t^2}", working: `a = \\dfrac{2(${fmt(s)} - (${fmt(u)})(${fmt(t)}))}{(${fmt(t)})^2}`, val: (2 * (s - u * t)) / (t * t) };
        if (x === "t") {
          const r = quad(0.5 * a, u, -s);
          if (r === null) return null;
          return { eq: "\\tfrac12 at^2 + ut - s = 0", working: `${fmt(0.5 * a)}t^2 + ${fmt(u)}t - ${fmt(s)} = 0 \\Rightarrow t`, val: r };
        }
        break;
      case "t": // v² = u² + 2as
        if (x === "v") return { eq: "v = \\sqrt{u^2 + 2as}", working: `v = \\sqrt{(${fmt(u)})^2 + 2(${fmt(a)})(${fmt(s)})}`, val: Math.sqrt(u * u + 2 * a * s) };
        if (x === "u") return { eq: "u = \\sqrt{v^2 - 2as}", working: `u = \\sqrt{(${fmt(v)})^2 - 2(${fmt(a)})(${fmt(s)})}`, val: Math.sqrt(v * v - 2 * a * s) };
        if (x === "a") return { eq: "a = \\dfrac{v^2 - u^2}{2s}", working: `a = \\dfrac{(${fmt(v)})^2 - (${fmt(u)})^2}{2(${fmt(s)})}`, val: (v * v - u * u) / (2 * s) };
        if (x === "s") return { eq: "s = \\dfrac{v^2 - u^2}{2a}", working: `s = \\dfrac{(${fmt(v)})^2 - (${fmt(u)})^2}{2(${fmt(a)})}`, val: (v * v - u * u) / (2 * a) };
        break;
      case "a": // s = ½(u+v)t
        if (x === "s") return { eq: "s = \\tfrac12(u + v)t", working: `s = \\tfrac12(${fmt(u)} + ${fmt(v)})(${fmt(t)})`, val: 0.5 * (u + v) * t };
        if (x === "t") return { eq: "t = \\dfrac{2s}{u + v}", working: `t = \\dfrac{2(${fmt(s)})}{${fmt(u)} + ${fmt(v)}}`, val: (2 * s) / (u + v) };
        if (x === "u") return { eq: "u = \\dfrac{2s}{t} - v", working: `u = \\dfrac{2(${fmt(s)})}{${fmt(t)}} - ${fmt(v)}`, val: (2 * s) / t - v };
        if (x === "v") return { eq: "v = \\dfrac{2s}{t} - u", working: `v = \\dfrac{2(${fmt(s)})}{${fmt(t)}} - ${fmt(u)}`, val: (2 * s) / t - u };
        break;
      case "u": // s = vt − ½at²
        if (x === "s") return { eq: "s = vt - \\tfrac12 at^2", working: `s = (${fmt(v)})(${fmt(t)}) - \\tfrac12(${fmt(a)})(${fmt(t)})^2`, val: v * t - 0.5 * a * t * t };
        if (x === "v") return { eq: "v = \\dfrac{s + \\tfrac12 at^2}{t}", working: `v = \\dfrac{${fmt(s)} + \\tfrac12(${fmt(a)})(${fmt(t)})^2}{${fmt(t)}}`, val: (s + 0.5 * a * t * t) / t };
        if (x === "a") return { eq: "a = \\dfrac{2(vt - s)}{t^2}", working: `a = \\dfrac{2((${fmt(v)})(${fmt(t)}) - ${fmt(s)})}{(${fmt(t)})^2}`, val: (2 * (v * t - s)) / (t * t) };
        if (x === "t") {
          const r = quad(0.5 * a, -v, s);
          if (r === null) return null;
          return { eq: "\\tfrac12 at^2 - vt + s = 0", working: `t`, val: r };
        }
        break;
    }
    return null;
  };

  let step = 2;
  const answers: string[] = [];
  for (const x of unknown) {
    // exclude the other unknown (or any other variable if only one unknown)
    const others = unknown.filter((y) => y !== x);
    const candidates = others.length ? others : all.filter((y) => y !== x);
    let res: ReturnType<typeof solveFor> = null;
    let chosen = "";
    for (const ex of candidates) {
      res = solveFor(x, ex);
      if (res && Number.isFinite(res.val)) {
        chosen = ex;
        break;
      }
    }
    if (!res || !Number.isFinite(res.val)) continue;
    vals[x] = res.val;
    lines.push(
      `**Step ${step++}: Find $${x}$ (${names[x]})**`,
      `We don't know $${chosen}$${others.length ? " (and don't need it here)" : ""}, so use the equation **without $${chosen}$**:`,
      `$$${res.eq}$$`,
      `$$${res.working} = ${fmt(res.val)}\\ ${units[x]}$$`,
    );
    answers.push(`$${x} = ${fmt(res.val)}\\ ${units[x]}$`);
  }
  if (!answers.length) return null;
  lines.push(`> **Answer:** ${answers.join(", ")}`);
  lines.push(`**Tip:** always pick the equation that leaves out the variable you don't know and don't need.`);
  return lines.join("\n\n");
}

function threeVar(
  textIn: string,
  cfg: { title: string; law: string; vars: [string, string, string]; units: [string, string, string]; nl: [string, RegExp][]; trigger: RegExp },
): string | null {
  const text = normalise(textIn);
  if (!cfg.trigger.test(text)) return null;
  const [P, Q, R] = cfg.vars; // P = Q × R
  const found = grab(text, [
    [P, new RegExp(`\\b${P}\\s*=\\s*${NUM}`)],
    [Q, new RegExp(`\\b${Q}\\s*=\\s*${NUM}`)],
    [R, new RegExp(`\\b${R}\\s*=\\s*${NUM}`)],
    ...cfg.nl.map(([n, re]) => [n, re] as [string, RegExp]),
  ]);
  const known = Object.keys(found);
  if (known.length !== 2) return null;
  const missing = cfg.vars.find((x) => !known.includes(x))!;
  const u = Object.fromEntries(cfg.vars.map((x, i) => [x, cfg.units[i]]));
  let val: number;
  let rearranged: string;
  if (missing === P) {
    val = found[Q] * found[R];
    rearranged = `${P} = ${Q}${R} = (${fmt(found[Q])})(${fmt(found[R])})`;
  } else if (missing === Q) {
    val = found[P] / found[R];
    rearranged = `${Q} = \\dfrac{${P}}{${R}} = \\dfrac{${fmt(found[P])}}{${fmt(found[R])}}`;
  } else {
    val = found[P] / found[Q];
    rearranged = `${R} = \\dfrac{${P}}{${Q}} = \\dfrac{${fmt(found[P])}}{${fmt(found[Q])}}`;
  }
  return [
    `## ${cfg.title}`,
    `**Step 1: Write down what you know**`,
    known.map((x) => `- $${x} = ${fmt(found[x])}\\ ${u[x]}$`).join("\n") + `\n- $${missing}$ = **?**`,
    `**Step 2: Choose the law**`,
    `$$${cfg.law}$$`,
    `**Step 3: Rearrange and substitute**`,
    `$$${rearranged} = ${fmt(val)}\\ ${u[missing]}$$`,
    `> **Answer:** $${missing} = ${fmt(val)}\\ ${u[missing]}$`,
  ].join("\n\n");
}

const newton = (t: string) =>
  threeVar(t, {
    title: "Newton's second law problem",
    law: "F = ma",
    vars: ["F", "m", "a"],
    units: ["\\text{N}", "\\text{kg}", "\\text{m s}^{-2}"],
    trigger: /\bforce\b|\bF\s*=|\bmass\b|newton/i,
    nl: [
      ["F", new RegExp(`force\\s*(?:of|is)?\\s*${NUM}\\s*N\\b`, "i")],
      ["m", new RegExp(`(?:mass\\s*(?:of|is)?\\s*${NUM}|${NUM}\\s*kg)`, "i")],
      ["a", new RegExp(`acceleration\\s*(?:of|is)?\\s*${NUM}`, "i")],
    ],
  });

const ohm = (t: string) =>
  threeVar(t, {
    title: "Ohm's law problem",
    law: "V = IR",
    vars: ["V", "I", "R"],
    units: ["\\text{V}", "\\text{A}", "\\Omega"],
    trigger: /\bV\s*=|\bI\s*=|\bR\s*=|resist|current|voltage|potential difference|p\.d\./i,
    nl: [
      ["V", new RegExp(`(?:voltage|potential difference|p\\.d\\.)\\s*(?:of|is|across)?\\s*${NUM}`, "i")],
      ["V", new RegExp(`${NUM}\\s*V\\b`)],
      ["I", new RegExp(`current\\s*(?:of|is)?\\s*${NUM}`, "i")],
      ["I", new RegExp(`${NUM}\\s*A\\b`)],
      ["R", new RegExp(`resistance\\s*(?:of|is)?\\s*${NUM}`, "i")],
      ["R", new RegExp(`${NUM}\\s*(?:Ω|ohms?\\b)`, "i")],
    ],
  });

/** Try every solver in priority order. Returns markdown, or null if nothing matched. */
export function solveProblem(text: string): string | null {
  const t = text.trim();
  if (/differentiat|derivative|d\/d[a-z]|find d[a-z]\/d[a-z]/i.test(t)) {
    const r = differentiate(t);
    if (r) return r;
  }
  if (/integrat|integral|∫/i.test(t)) {
    const r = integrate(t);
    if (r) return r;
  }
  return ohm(t) ?? newton(t) ?? suvat(t) ?? solveEquation(t) ?? arithmetic(t);
}
