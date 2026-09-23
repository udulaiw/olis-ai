// ─────────────────────────────────────────────
// Sri Lankan G.C.E. Advanced Level: topic taxonomy.
//
// STATUS: PROVISIONAL. This is an organising structure for OLIS's knowledge
// base, past papers and routing. It is NOT the official syllabus: unit names
// follow common A/L usage, and `officialRef` is left empty until each unit is
// checked against the NIE / Department of Examinations syllabus documents.
//
// To verify a unit: add the syllabus PDF text under knowledge/syllabus/<subject>/,
// set `officialRef` (e.g. "NIE 2017 syllabus, Unit 4") and `verified: true`.
//
// `keywords` are search/routing hints only (English + common Singlish/Sinhala
// terms students type), not syllabus content.
// ─────────────────────────────────────────────

export type AlSubjectId = "combined-mathematics" | "physics" | "chemistry";

export interface Unit {
  id: string;
  name: string;
  keywords: string[];
  officialRef: string | null;
  verified: boolean;
}

export interface SubjectTaxonomy {
  id: AlSubjectId;
  name: string;
  /** Names the frontend / knowledge frontmatter may use for this subject. */
  aliases: string[];
  units: Unit[];
}

const u = (id: string, name: string, keywords: string[]): Unit => ({ id, name, keywords, officialRef: null, verified: false });

export const TAXONOMY: SubjectTaxonomy[] = [
  {
    id: "combined-mathematics",
    name: "Combined Mathematics",
    aliases: ["combined mathematics", "combined maths", "pure mathematics", "applied mathematics", "maths", "math", "ganithaya", "ගණිතය"],
    units: [
      u("algebra", "Algebra", ["algebra", "polynomial", "quadratic", "inequality", "binomial", "series", "sequence", "permutation", "combination", "induction", "partial fraction", "logarithm"]),
      u("functions", "Functions", ["function", "domain", "range", "inverse function", "composite", "modulus function", "graph of"]),
      u("trigonometry", "Trigonometry", ["trigonometry", "trig", "sin", "cos", "tan", "sine rule", "cosine rule", "identity", "radian", "inverse trig"]),
      u("calculus", "Calculus (limits and continuity)", ["limit", "continuity", "calculus", "first principles"]),
      u("differentiation", "Differentiation", ["differentiate", "differentiation", "derivative", "d/dx", "dy/dx", "stationary point", "maximum", "minimum", "rate of change", "tangent", "normal", "implicit", "parametric"]),
      u("integration", "Integration", ["integrate", "integration", "integral", "∫", "area under", "by parts", "substitution", "definite integral", "volume of revolution"]),
      u("complex-numbers", "Complex numbers", ["complex number", "argand", "modulus", "argument", "conjugate", "de moivre", "imaginary"]),
      u("vectors", "Vectors", ["vector", "dot product", "scalar product", "position vector", "unit vector"]),
      u("matrices", "Matrices", ["matrix", "matrices", "determinant", "inverse matrix", "transpose"]),
      u("coordinate-geometry", "Coordinate geometry", ["straight line", "gradient", "circle", "coordinate", "locus", "parabola", "ellipse", "equation of a line"]),
      u("mechanics", "Mechanics (applied mathematics)", ["statics", "dynamics", "particle", "equilibrium", "resultant", "friction", "projectile", "moment", "couple", "work energy", "impulse", "circular motion", "simple harmonic", "centre of mass", "frameworks", "relative velocity"]),
      u("statistics-probability", "Statistics and probability", ["probability", "statistics", "mean", "variance", "standard deviation", "distribution", "bayes", "conditional probability", "median", "mode"]),
    ],
  },
  {
    id: "physics",
    name: "Physics",
    aliases: ["physics", "bhouthika", "භෞතික"],
    units: [
      u("measurement", "Measurements and experimental physics", ["measurement", "unit", "dimension", "error", "uncertainty", "vernier", "micrometer", "significant figure", "experiment", "practical"]),
      u("mechanics", "Mechanics", ["force", "newton", "momentum", "velocity", "acceleration", "kinematics", "projectile", "work", "energy", "power", "torque", "circular motion", "gravitation", "fluid", "pressure", "elasticity", "young's modulus"]),
      u("waves", "Oscillations and waves", ["wave", "oscillation", "shm", "frequency", "wavelength", "sound", "interference", "diffraction", "resonance", "doppler", "standing wave", "light", "optics", "lens", "refraction"]),
      u("thermal", "Thermal physics", ["heat", "temperature", "thermal", "specific heat", "latent heat", "gas law", "kinetic theory", "thermodynamics", "expansion", "humidity"]),
      u("electricity", "Electricity (current and electrostatics)", ["current", "voltage", "resistance", "ohm", "circuit", "kirchhoff", "potentiometer", "wheatstone", "capacitor", "electric field", "charge", "coulomb", "potential difference"]),
      u("magnetism", "Magnetism and electromagnetism", ["magnetic", "magnet", "flux", "induction", "faraday", "lenz", "solenoid", "transformer", "tesla"]),
      u("electronics", "Electronics", ["diode", "transistor", "logic gate", "semiconductor", "amplifier", "op-amp", "rectifier", "p-n junction"]),
      u("modern-physics", "Modern physics", ["photoelectric", "photon", "quantum", "radioactivity", "half-life", "nucleus", "x-ray", "de broglie", "atomic spectra", "relativity"]),
    ],
  },
  {
    id: "chemistry",
    name: "Chemistry",
    aliases: ["chemistry", "rasayana", "රසායන"],
    units: [
      u("atomic-structure", "Atomic structure", ["atomic structure", "electron configuration", "orbital", "quantum number", "isotope", "ionisation energy", "ionization energy", "periodic table"]),
      u("bonding", "Chemical bonding", ["bond", "bonding", "covalent", "ionic", "vsepr", "hybridisation", "hybridization", "shape of molecule", "intermolecular", "lewis structure", "electronegativity"]),
      u("energetics", "Chemical energetics", ["enthalpy", "hess", "energetics", "exothermic", "endothermic", "bond energy", "lattice energy", "born-haber", "entropy", "gibbs"]),
      u("kinetics", "Chemical kinetics", ["rate of reaction", "kinetics", "rate constant", "order of reaction", "activation energy", "catalyst", "rate law"]),
      u("equilibrium", "Chemical equilibrium", ["equilibrium", "le chatelier", "kc", "kp", "solubility product", "ksp", "dynamic equilibrium"]),
      u("acids-bases", "Acids, bases and ionic equilibria", ["acid", "base", "ph", "buffer", "titration", "indicator", "pka", "hydrolysis", "neutralisation"]),
      u("electrochemistry", "Electrochemistry", ["electrochemistry", "electrolysis", "electrode potential", "cell potential", "galvanic", "redox", "faraday constant", "electrochemical cell"]),
      u("organic", "Organic chemistry", ["organic", "alkane", "alkene", "alkyne", "alcohol", "aldehyde", "ketone", "carboxylic", "ester", "amine", "benzene", "isomer", "mechanism", "nucleophilic", "electrophilic", "polymer", "iupac"]),
      u("inorganic", "Inorganic chemistry", ["inorganic", "s-block", "p-block", "d-block", "transition metal", "halogen", "group 1", "group 2", "complex ion", "oxide", "nitrogen compounds", "sulfur"]),
      u("analytical", "Analytical chemistry", ["analytical", "qualitative analysis", "quantitative analysis", "mole", "stoichiometry", "gravimetric", "volumetric", "chromatography", "spectroscopy", "concentration"]),
    ],
  },
];

const norm = (s: string) => s.toLowerCase();

/** Short keywords ("sin", "ph", "mean") must match as whole words; longer ones may match inside ("derivatives"). */
function hits(text: string, words: string[]): number {
  const padded = ` ${text.replace(/[^\p{L}\p{N}∫/'-]+/gu, " ")} `;
  let n = 0;
  for (const w of words) {
    const k = norm(w);
    const found = k.length <= 5 ? padded.includes(` ${k} `) || padded.includes(` ${k}s `) : text.includes(k);
    if (found) n += k.length > 5 ? 2 : 1;
  }
  return n;
}

export interface TopicGuess {
  subject: AlSubjectId;
  unit: Unit;
  score: number;
}

/** Best-guess subject + unit for a question (routing and past-paper tagging). */
export function guessTopic(text: string, subjectHint?: string): TopicGuess | null {
  const t = norm(text);
  let best: TopicGuess | null = null;
  for (const s of TAXONOMY) {
    const boost = subjectHint && (norm(subjectHint) === norm(s.name) || s.aliases.includes(norm(subjectHint))) ? 1 : 0;
    for (const unit of s.units) {
      const score = hits(t, unit.keywords) + (hits(t, s.aliases) ? 1 : 0) + boost;
      if (score > (best?.score ?? 0)) best = { subject: s.id, unit, score };
    }
  }
  return best && best.score >= 2 ? best : null;
}

export function subjectByName(name: string | undefined): SubjectTaxonomy | undefined {
  if (!name) return undefined;
  const n = norm(name);
  return TAXONOMY.find((s) => norm(s.name) === n || s.id === n || s.aliases.includes(n));
}

/** Compact unit list for the system prompt ("what topic is this testing?"). */
export function taxonomyPromptBlock(subjectName?: string): string {
  const list = subjectByName(subjectName) ? [subjectByName(subjectName)!] : TAXONOMY;
  return list.map((s) => `${s.name}: ${s.units.map((x) => x.name).join(" · ")}`).join("\n");
}
