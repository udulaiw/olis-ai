// Deterministic maths for the OLIS agent. Language models slip on arithmetic,
// derivatives and unit conversions; this tool lets them CHECK a result instead
// of trusting their own mental maths. It is a verifier, not a solver: the
// student still gets a worked explanation.
import { create, all } from "mathjs";

const math = create(all);
// Lock the instance down: the expression comes from a model, which got it from a student.
const safe = {
  evaluate: math.evaluate.bind(math),
  parse: math.parse.bind(math),
  simplify: math.simplify.bind(math),
  derivative: math.derivative.bind(math),
  format: math.format.bind(math),
};
math.import(
  {
    import: () => {
      throw new Error("disabled");
    },
    createUnit: () => {
      throw new Error("disabled");
    },
    reviver: () => {
      throw new Error("disabled");
    },
    evaluate: () => {
      throw new Error("disabled");
    },
    parse: () => {
      throw new Error("disabled");
    },
    simplify: () => {
      throw new Error("disabled");
    },
    derivative: () => {
      throw new Error("disabled");
    },
  },
  { override: true },
);

const MAX_EXPR = 300;
const fmt = (v: unknown) => safe.format(v, { precision: 10 });
const num = (v: unknown, name: string) => {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
};
const variable = (v: unknown) => {
  const s = String(v ?? "x").trim() || "x";
  if (!/^[a-zA-Z]$/.test(s)) throw new Error("variable must be a single letter");
  return s;
};
const expr = (v: unknown, name = "expr") => {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`${name} is required`);
  if (s.length > MAX_EXPR) throw new Error(`${name} is too long`);
  return s.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/²/g, "^2").replace(/³/g, "^3");
};

export const MATH_OPS = ["evaluate", "derivative", "simplify", "integrate_numeric", "quadratic", "equivalent"] as const;

/** Never throws: errors come back as { error } so the model can correct itself. */
export function mathCheck(args: Record<string, unknown>): Record<string, unknown> {
  try {
    const op = String(args.op ?? "");
    switch (op) {
      case "evaluate": {
        // arithmetic, trig (radians unless "deg" is written), logs, and unit conversion ("72 km/h to m/s")
        const r = safe.evaluate(expr(args.expr));
        return { op, result: fmt(r) };
      }
      case "derivative": {
        const v = variable(args.variable);
        const d = safe.derivative(expr(args.expr), v);
        return { op, variable: v, result: d.toString(), simplified: safe.simplify(d).toString() };
      }
      case "simplify":
        return { op, result: safe.simplify(expr(args.expr)).toString() };
      case "integrate_numeric": {
        // Composite Simpson. This is a NUMERIC check of a definite integral, not an antiderivative.
        const v = variable(args.variable);
        const a = num(args.a, "a");
        const b = num(args.b, "b");
        const node = safe.parse(expr(args.expr)).compile();
        const n = 2000;
        const h = (b - a) / n;
        const f = (x: number) => Number(node.evaluate({ [v]: x }));
        let sum = f(a) + f(b);
        for (let i = 1; i < n; i++) sum += f(a + i * h) * (i % 2 ? 4 : 2);
        const val = (sum * h) / 3;
        if (!Number.isFinite(val)) throw new Error("integral is not finite on [a, b]");
        return { op, result: fmt(val), note: "numeric (Simpson, n=2000), accurate for smooth functions; compare with your exact answer" };
      }
      case "quadratic": {
        const a = num(args.a, "a");
        const b = num(args.b, "b");
        const c = num(args.c, "c");
        if (a === 0) throw new Error("a must not be 0");
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const s = Math.sqrt(disc);
          return { op, discriminant: fmt(disc), roots: [fmt((-b + s) / (2 * a)), fmt((-b - s) / (2 * a))], nature: disc === 0 ? "equal real roots" : "two distinct real roots" };
        }
        const s = Math.sqrt(-disc);
        return { op, discriminant: fmt(disc), roots: [`${fmt(-b / (2 * a))} + ${fmt(s / (2 * a))}i`, `${fmt(-b / (2 * a))} - ${fmt(s / (2 * a))}i`], nature: "complex conjugate roots" };
      }
      case "equivalent": {
        // Are two expressions equal as functions? Sampled at several points: a strong check on a student's simplification, not a proof.
        const v = variable(args.variable);
        const e1 = safe.parse(expr(args.expr)).compile();
        const e2 = safe.parse(expr(args.expr2, "expr2")).compile();
        const pts = [-3.7, -1.3, -0.4, 0.6, 1.9, 2.8, 4.1];
        let tested = 0;
        for (const x of pts) {
          const A = Number(e1.evaluate({ [v]: x }));
          const B = Number(e2.evaluate({ [v]: x }));
          if (!Number.isFinite(A) || !Number.isFinite(B)) continue;
          tested++;
          if (Math.abs(A - B) > 1e-7 * Math.max(1, Math.abs(A), Math.abs(B))) return { op, equivalent: false, counterexample: { [v]: x, expr: A, expr2: B } };
        }
        return tested >= 3 ? { op, equivalent: true, note: `equal at ${tested} sample points` } : { op, error: "not enough points where both are defined" };
      }
      default:
        return { error: `op must be one of: ${MATH_OPS.join(", ")}` };
    }
  } catch (e) {
    return { error: String((e as Error).message ?? e).slice(0, 160) };
  }
}
