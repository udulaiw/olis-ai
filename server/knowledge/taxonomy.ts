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

export type ExamLevel = "OL" | "AL";
export type AlSubjectId = "combined-mathematics" | "physics" | "chemistry";
export type OlSubjectId = "ol-mathematics" | "ol-science" | "ol-ict" | "ol-english" | "ol-sinhala" | "ol-history" | "ol-geography" | "ol-commerce" | "ol-health" | "ol-religion";
export type SubjectId = AlSubjectId | OlSubjectId;

export interface Unit {
  id: string;
  name: string;
  keywords: string[];
  officialRef: string | null;
  verified: boolean;
}

export interface SubjectTaxonomy {
  id: SubjectId;
  /** G.C.E. Ordinary Level or Advanced Level */
  level: ExamLevel;
  name: string;
  /** Names the frontend / knowledge frontmatter may use for this subject. */
  aliases: string[];
  units: Unit[];
}

const u = (id: string, name: string, keywords: string[]): Unit => ({ id, name, keywords, officialRef: null, verified: false });

export const TAXONOMY: SubjectTaxonomy[] = [
  {
    id: "combined-mathematics",
    level: "AL",
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
    level: "AL",
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
    level: "AL",
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
  // ── G.C.E. Ordinary Level (Grades 10–11) ─────────────────────────────────
  // Same PROVISIONAL status as the A/L entries above: unit names follow common
  // classroom usage, not the NIE syllabus wording. Subjects with no units yet
  // (languages, humanities, commerce…) are listed so routing and level filtering
  // work; add their units once the syllabus text is in knowledge/syllabus/.
  {
    id: "ol-mathematics",
    level: "OL",
    name: "Mathematics (O/L)",
    aliases: ["mathematics", "maths", "math", "o/l maths", "o/l mathematics", "ganithaya", "ගණිතය"],
    units: [
      u("ol-number", "Numbers, indices and logarithms", ["indices", "index", "logarithm", "log", "surd", "standard form", "significant figures", "number", "fraction", "decimal"]),
      u("ol-ratio-percentage", "Ratios, percentages and financial mathematics", ["ratio", "proportion", "percentage", "percent", "interest", "compound interest", "profit", "loss", "discount", "rates", "taxes", "commission"]),
      u("ol-algebra", "Algebra", ["algebra", "expression", "factorise", "factorisation", "expand", "simplify", "substitution", "formula", "change the subject", "algebraic fraction"]),
      u("ol-equations", "Equations and inequalities", ["equation", "simultaneous", "linear equation", "quadratic equation", "inequality", "inequalities", "solve for", "root", "discriminant"]),
      u("ol-sets", "Sets and Venn diagrams", ["set", "sets", "venn", "union", "intersection", "subset", "universal set", "complement"]),
      u("ol-geometry", "Geometry", ["angle", "triangle", "parallel lines", "polygon", "congruent", "similar triangles", "circle theorem", "chord", "tangent", "pythagoras", "construction", "locus", "bisector"]),
      u("ol-mensuration", "Mensuration (area and volume)", ["area", "perimeter", "volume", "surface area", "cylinder", "cone", "sphere", "prism", "sector", "arc length", "circumference"]),
      u("ol-trigonometry", "Trigonometry", ["sin", "cos", "tan", "trigonometry", "trigonometric", "angle of elevation", "angle of depression", "bearing", "right-angled triangle"]),
      u("ol-graphs", "Graphs and functions", ["graph", "gradient", "straight line", "coordinate", "y = mx", "quadratic graph", "function", "intercept", "plot"]),
      u("ol-statistics", "Statistics", ["mean", "median", "mode", "range", "frequency table", "histogram", "pie chart", "cumulative frequency", "quartile", "ogive", "statistics"]),
      u("ol-probability", "Probability", ["probability", "tree diagram", "sample space", "event", "outcome", "chance", "likelihood"]),
      u("ol-sequences", "Sequences and series", ["sequence", "arithmetic progression", "geometric progression", "nth term", "common difference", "common ratio", "series"]),
    ],
  },
  {
    id: "ol-science",
    level: "OL",
    name: "Science (O/L)",
    aliases: ["science", "o/l science", "general science", "vidyawa", "විද්‍යාව"],
    units: [
      u("ol-motion-forces", "Motion and forces", ["motion", "speed", "velocity", "acceleration", "force", "newton", "momentum", "friction", "gravity", "weight", "mass", "distance-time", "velocity-time"]),
      u("ol-work-energy", "Work, energy and power", ["work", "energy", "power", "kinetic energy", "potential energy", "conservation of energy", "efficiency", "machine", "lever", "pulley"]),
      u("ol-pressure", "Pressure and fluids", ["pressure", "density", "upthrust", "archimedes", "floating", "hydraulic", "atmospheric pressure", "barometer"]),
      u("ol-heat", "Heat and temperature", ["heat", "temperature", "thermometer", "conduction", "convection", "radiation", "specific heat", "latent heat", "expansion"]),
      u("ol-light-waves", "Light, waves and sound", ["light", "reflection", "refraction", "lens", "mirror", "wave", "sound", "frequency", "wavelength", "echo", "dispersion", "spectrum"]),
      u("ol-electricity", "Electricity and magnetism", ["current", "voltage", "resistance", "ohm", "circuit", "series", "parallel", "electric", "magnet", "magnetic", "electromagnet", "fuse", "household wiring"]),
      u("ol-matter-atoms", "Matter, atoms and the periodic table", ["atom", "molecule", "element", "compound", "mixture", "periodic table", "proton", "neutron", "electron", "isotope", "valency", "states of matter"]),
      u("ol-chem-reactions", "Chemical reactions, acids, bases and salts", ["acid", "base", "alkali", "salt", "ph", "indicator", "neutralisation", "reaction", "rate of reaction", "mole", "chemical equation", "oxidation", "reduction", "rusting"]),
      u("ol-carbon-metals", "Carbon compounds and metals", ["organic", "hydrocarbon", "alkane", "alkene", "alcohol", "metals", "reactivity series", "extraction of metals", "alloy", "corrosion", "polymer"]),
      u("ol-cells-organisms", "Cells, nutrition and transport", ["cell", "tissue", "organ", "nutrition", "digestion", "enzyme", "photosynthesis", "respiration", "blood", "heart", "circulation", "transport in plants", "diffusion", "osmosis"]),
      u("ol-reproduction-genetics", "Reproduction, genetics and evolution", ["reproduction", "gene", "dna", "chromosome", "heredity", "inheritance", "mutation", "evolution", "natural selection", "mitosis", "meiosis"]),
      u("ol-ecology", "Ecology and the environment", ["ecosystem", "food chain", "food web", "habitat", "population", "pollution", "conservation", "biodiversity", "environment", "nitrogen cycle", "carbon cycle"]),
    ],
  },
  {
    id: "ol-ict",
    level: "OL",
    name: "ICT (O/L)",
    aliases: ["ict", "information and communication technology", "information technology", "o/l ict", "computer", "තොරතුරු තාක්ෂණය"],
    units: [
      u("ol-ict-hardware", "Computer hardware and software", ["hardware", "software", "cpu", "ram", "operating system", "input device", "output device", "storage", "motherboard"]),
      u("ol-ict-numbers", "Number systems and logic", ["binary", "hexadecimal", "octal", "number system", "logic gate", "boolean", "and gate", "or gate", "not gate", "truth table"]),
      u("ol-ict-programming", "Programming and algorithms", ["algorithm", "flowchart", "pseudocode", "programming", "loop", "variable", "python", "pascal", "debugging"]),
      u("ol-ict-database", "Databases and spreadsheets", ["database", "table", "primary key", "query", "spreadsheet", "excel", "formula", "cell reference", "word processing"]),
      u("ol-ict-networks", "Networks and the internet", ["network", "internet", "lan", "wan", "protocol", "ip address", "email", "browser", "website", "cyber security", "ethics"]),
    ],
  },
  { id: "ol-english", level: "OL", name: "English (O/L)", aliases: ["english", "o/l english", "english language", "ඉංග්‍රීසි"], units: [] },
  { id: "ol-sinhala", level: "OL", name: "Sinhala Language and Literature (O/L)", aliases: ["sinhala language", "sinhala literature", "o/l sinhala", "සිංහල භාෂාව", "සිංහල සාහිත්‍යය"], units: [] },
  { id: "ol-history", level: "OL", name: "History (O/L)", aliases: ["history", "o/l history", "ඉතිහාසය"], units: [] },
  { id: "ol-geography", level: "OL", name: "Geography (O/L)", aliases: ["geography", "o/l geography", "භූගෝල විද්‍යාව"], units: [] },
  { id: "ol-commerce", level: "OL", name: "Business and Accounting Studies (O/L)", aliases: ["commerce", "business studies", "accounting", "business and accounting", "o/l commerce"], units: [] },
  { id: "ol-health", level: "OL", name: "Health and Physical Education (O/L)", aliases: ["health", "health and physical education", "o/l health"], units: [] },
  { id: "ol-religion", level: "OL", name: "Religion (O/L)", aliases: ["buddhism", "religion", "christianity", "catholicism", "islam", "hinduism", "o/l religion"], units: [] },
];

const norm = (s: string) => s.toLowerCase();

/** Short keywords ("sin", "ph", "mean") must match as whole words; longer ones may match inside ("derivatives"). */
function hits(text: string, words: string[]): number {
  const padded = ` ${text.replace(/[^\p{L}\p{M}\p{N}∫/'-]+/gu, " ")} `;
  let n = 0;
  for (const w of words) {
    const k = norm(w);
    const found = k.length <= 5 ? padded.includes(` ${k} `) || padded.includes(` ${k}s `) : text.includes(k);
    if (found) n += k.length > 5 ? 2 : 1;
  }
  return n;
}

export interface TopicGuess {
  subject: SubjectId;
  unit: Unit;
  score: number;
}

/**
 * Best-guess subject + unit for a question (routing and past-paper tagging).
 * `level` restricts the search to one exam level; pass the student's level
 * whenever it is known so O/L questions never route into A/L units (and back).
 */
export function guessTopic(text: string, subjectHint?: string, level?: ExamLevel | null): TopicGuess | null {
  const t = norm(text);
  let best: TopicGuess | null = null;
  for (const s of TAXONOMY) {
    if (level && s.level !== level) continue;
    const boost = subjectHint && (norm(subjectHint) === norm(s.name) || s.aliases.includes(norm(subjectHint))) ? 1 : 0;
    for (const unit of s.units) {
      const score = hits(t, unit.keywords) + (hits(t, s.aliases) ? 1 : 0) + boost;
      if (score > (best?.score ?? 0)) best = { subject: s.id, unit, score };
    }
  }
  return best && best.score >= 2 ? best : null;
}

/** Subject only (works for subjects that have no units yet, e.g. History). */
export function guessSubject(text: string, subjectHint?: string, level?: ExamLevel | null): SubjectTaxonomy | null {
  const t = norm(text);
  let best: { s: SubjectTaxonomy; score: number } | null = null;
  for (const s of TAXONOMY) {
    if (level && s.level !== level) continue;
    const hint = subjectHint && (norm(subjectHint) === norm(s.name) || s.aliases.includes(norm(subjectHint))) ? 1 : 0;
    const score = hits(t, s.aliases) * 2 + s.units.reduce((n, un) => n + Math.min(2, hits(t, un.keywords)), 0) + hint;
    if (score > (best?.score ?? 0)) best = { s, score };
  }
  return best && best.score >= 2 ? best.s : null;
}

export function subjectByName(name: string | undefined): SubjectTaxonomy | undefined {
  if (!name) return undefined;
  const n = norm(name);
  return TAXONOMY.find((s) => norm(s.name) === n || s.id === n || s.aliases.includes(n));
}

/** Compact unit list for the system prompt ("what topic is this testing?"). */
export function taxonomyPromptBlock(subjectName?: string, level?: ExamLevel | null): string {
  const one = subjectByName(subjectName);
  const list = one && (!level || one.level === level) ? [one] : TAXONOMY.filter((s) => (!level || s.level === level) && s.units.length);
  return list.map((s) => `${s.name}: ${s.units.map((x) => x.name).join(" · ")}`).join("\n");
}
