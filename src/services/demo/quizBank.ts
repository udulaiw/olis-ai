// Offline question bank for the demo engine.
// Each question is tagged with a subject, difficulty and topic tags so the
// engine can build a quiz for "Quiz me on organic chemistry" etc.
import type { Difficulty, QuizQuestion, Subject } from "../../types";

export interface BankQuestion extends QuizQuestion {
  subject: Subject;
  difficulty: Difficulty;
  tags: string[];
}

const q = (
  subject: Subject,
  difficulty: Difficulty,
  tags: string[],
  question: string,
  options: string[],
  answer: number,
  explanation: string,
): BankQuestion => ({ subject, difficulty, tags, q: question, options, answer, explanation });

export const QUIZ_BANK: BankQuestion[] = [
  // ── Physics ──
  q("Physics", "Easy", ["newton", "forces", "mechanics"], "Which law explains why passengers lurch forward when a bus brakes suddenly?",
    ["Newton's first law", "Newton's second law", "Newton's third law", "Law of conservation of energy"], 0,
    "Passengers tend to keep moving at the bus's original velocity (inertia) when the bus decelerates. That's the first law."),
  q("Physics", "Easy", ["newton", "forces", "mechanics"], "A resultant force of 12 N acts on a 4 kg mass. What is its acceleration?",
    ["48 m s⁻²", "3 m s⁻²", "0.33 m s⁻²", "16 m s⁻²"], 1,
    "Using $a = F/m = 12/4 = 3\\ \\text{m s}^{-2}$."),
  q("Physics", "Medium", ["newton", "forces", "mechanics"], "A book rests on a table. Which force is the Newton's-third-law partner of the book's weight?",
    ["The normal reaction of the table on the book", "The book's gravitational pull on the Earth", "Friction between book and table", "The table's weight"], 1,
    "Third-law pairs act on **different** bodies and are the **same type** of force. Earth pulls the book down, so the book pulls Earth up (gravitational)."),
  q("Physics", "Easy", ["kinematics", "suvat", "mechanics"], "A car accelerates from rest at 2 m s⁻² for 5 s. What is its final velocity?",
    ["7 m s⁻¹", "2.5 m s⁻¹", "10 m s⁻¹", "25 m s⁻¹"], 2,
    "$v = u + at = 0 + 2 \\times 5 = 10\\ \\text{m s}^{-1}$."),
  q("Physics", "Medium", ["kinematics", "suvat", "mechanics", "graphs"], "What does the area under a velocity–time graph represent?",
    ["Acceleration", "Displacement", "Force", "Jerk"], 1,
    "Area = velocity × time = displacement."),
  q("Physics", "Hard", ["kinematics", "suvat", "mechanics"], "A ball is thrown upward at 20 m s⁻¹ (g = 10 m s⁻²). How high does it rise?",
    ["10 m", "20 m", "40 m", "200 m"], 1,
    "At the top $v = 0$: $0 = 20^2 - 2(10)s \\Rightarrow s = 400/20 = 20\\ \\text{m}$."),
  q("Physics", "Medium", ["energy", "work", "power"], "A 50 kg student climbs 4 m in 5 s (g = 10 m s⁻²). What is their power output?",
    ["40 W", "400 W", "1000 W", "2000 W"], 1,
    "Work = $mgh = 50 \\times 10 \\times 4 = 2000\\ \\text{J}$; power = $2000/5 = 400\\ \\text{W}$."),
  q("Physics", "Medium", ["momentum", "collisions"], "Which quantity is always conserved in a collision with no external forces?",
    ["Kinetic energy", "Velocity", "Momentum", "Speed"], 2,
    "Momentum is conserved in all collisions in a closed system; kinetic energy is only conserved in elastic ones."),
  q("Physics", "Easy", ["electricity", "circuits", "ohm"], "A 6 V supply drives a current of 2 A through a resistor. What is the resistance?",
    ["12 Ω", "3 Ω", "0.33 Ω", "8 Ω"], 1,
    "$R = V/I = 6/2 = 3\\ \\Omega$."),
  q("Physics", "Medium", ["electricity", "circuits"], "Two 6 Ω resistors are connected in parallel. What is the total resistance?",
    ["12 Ω", "6 Ω", "3 Ω", "1.5 Ω"], 2,
    "$\\frac1R = \\frac16 + \\frac16 = \\frac13 \\Rightarrow R = 3\\ \\Omega$."),
  q("Physics", "Easy", ["waves"], "A wave has frequency 50 Hz and wavelength 2 m. What is its speed?",
    ["25 m s⁻¹", "52 m s⁻¹", "100 m s⁻¹", "0.04 m s⁻¹"], 2,
    "$v = f\\lambda = 50 \\times 2 = 100\\ \\text{m s}^{-1}$."),
  q("Physics", "Hard", ["waves"], "When light passes from air into glass, which property stays the same?",
    ["Speed", "Wavelength", "Frequency", "Direction (always)"], 2,
    "Frequency is set by the source and doesn't change at a boundary; speed and wavelength both decrease."),
  q("Physics", "Hard", ["projectile", "mechanics"], "Ignoring air resistance, which launch angle gives the maximum range on level ground?",
    ["30°", "45°", "60°", "90°"], 1,
    "$R = u^2\\sin 2\\theta / g$ is maximised when $\\sin 2\\theta = 1$, i.e. $\\theta = 45^\\circ$."),

  // ── Chemistry: organic ──
  q("Chemistry", "Easy", ["organic", "functional group"], "Which functional group is present in all alcohols?",
    ["–COOH", "–OH", "C=C", "–CHO"], 1,
    "Alcohols contain the hydroxyl group, –OH."),
  q("Chemistry", "Easy", ["organic", "homologous series", "alkene"], "What is the general formula of the alkenes?",
    ["CₙH₂ₙ₊₂", "CₙH₂ₙ", "CₙH₂ₙ₋₂", "CₙH₂ₙ₊₁OH"], 1,
    "Alkenes have one C=C double bond: $\\text{C}_n\\text{H}_{2n}$."),
  q("Chemistry", "Medium", ["organic", "nomenclature"], "What is the IUPAC name of CH₃CH(OH)CH₃?",
    ["Propan-1-ol", "Propan-2-ol", "2-methylethanol", "Propanal"], 1,
    "A three-carbon chain (prop-) with –OH on carbon 2 gives propan-2-ol."),
  q("Chemistry", "Medium", ["organic", "isomerism"], "Butane and methylpropane are examples of which type of isomerism?",
    ["Chain isomerism", "Position isomerism", "E/Z isomerism", "Optical isomerism"], 0,
    "Both have the formula C₄H₁₀ but different carbon skeletons. That's chain (structural) isomerism."),
  q("Chemistry", "Medium", ["organic", "alkene", "reactions"], "What is observed when ethene is bubbled through bromine water?",
    ["It turns orange", "It decolourises from orange to colourless", "A white precipitate forms", "It turns blue"], 1,
    "Br₂ adds across the C=C bond (electrophilic addition), removing the orange colour. This is the standard test for unsaturation."),
  q("Chemistry", "Hard", ["organic", "isomerism", "chiral"], "A molecule shows optical isomerism when it contains…",
    ["A C=C double bond", "A carbon bonded to four different groups", "A benzene ring", "An –OH group"], 1,
    "A chiral centre (a carbon with four different groups) gives non-superimposable mirror images."),
  q("Chemistry", "Hard", ["organic", "mechanism", "haloalkane"], "What type of mechanism occurs when a haloalkane reacts with aqueous NaOH?",
    ["Electrophilic addition", "Free-radical substitution", "Nucleophilic substitution", "Elimination only"], 2,
    "The OH⁻ nucleophile attacks the δ+ carbon and replaces the halogen: nucleophilic substitution."),
  q("Chemistry", "Easy", ["organic", "alkane"], "Alkanes are described as saturated because they…",
    ["Dissolve in water", "Contain only single C–C bonds", "Contain oxygen", "Are gases"], 1,
    "Saturated means only single bonds, so no more hydrogen can be added."),

  // ── Chemistry: general ──
  q("Chemistry", "Easy", ["atomic structure"], "Isotopes of an element differ in their number of…",
    ["Protons", "Electrons", "Neutrons", "Energy levels"], 2,
    "Isotopes have the same number of protons but different numbers of neutrons."),
  q("Chemistry", "Medium", ["atomic structure", "electron configuration"], "What is the electron configuration of Na⁺?",
    ["1s² 2s² 2p⁶ 3s¹", "1s² 2s² 2p⁶", "1s² 2s² 2p⁵", "1s² 2s² 2p⁶ 3s²"], 1,
    "Na is 1s² 2s² 2p⁶ 3s¹; losing the 3s electron gives 1s² 2s² 2p⁶."),
  q("Chemistry", "Medium", ["bonding", "shapes"], "What is the bond angle in a water molecule?",
    ["180°", "109.5°", "107°", "104.5°"], 3,
    "Two bonding pairs and two lone pairs; the lone pairs repel more, squeezing the angle to about 104.5°."),
  q("Chemistry", "Easy", ["mole"], "How many moles are in 36 g of water (M = 18 g mol⁻¹)?",
    ["0.5", "2", "18", "648"], 1,
    "$n = m/M = 36/18 = 2\\ \\text{mol}$."),
  q("Chemistry", "Medium", ["mole", "concentration"], "How many moles of NaOH are in 25.0 cm³ of 0.200 mol dm⁻³ solution?",
    ["5.00", "0.00500", "0.0500", "8.00"], 1,
    "$n = cV = 0.200 \\times 25.0/1000 = 0.00500\\ \\text{mol}$."),
  q("Chemistry", "Easy", ["acids", "ph"], "What is the pH of 0.01 mol dm⁻³ HCl?",
    ["1", "2", "12", "0.01"], 1,
    "HCl is strong, so $[\\text{H}^+] = 0.01$ and $\\text{pH} = -\\log_{10}(0.01) = 2$."),
  q("Chemistry", "Medium", ["rates", "catalyst"], "How does a catalyst increase the rate of reaction?",
    ["It increases particle energy", "It provides a pathway with lower activation energy", "It increases concentration", "It shifts the equilibrium right"], 1,
    "A catalyst offers an alternative route with a lower $E_a$, so more collisions are successful."),

  // ── Combined Mathematics ──
  q("Combined Mathematics", "Easy", ["differentiation", "calculus"], "Differentiate $y = 5x^3$.",
    ["$15x^2$", "$5x^2$", "$15x^3$", "$\\frac{5}{4}x^4$"], 0,
    "Power rule: $3 \\times 5x^{2} = 15x^2$."),
  q("Combined Mathematics", "Medium", ["differentiation", "calculus", "chain rule"], "What is $\\frac{d}{dx}\\sin(3x)$?",
    ["$\\cos(3x)$", "$3\\cos(3x)$", "$-3\\cos(3x)$", "$3\\sin(3x)$"], 1,
    "Chain rule: the derivative of the outer function times the derivative of the inner, $\\cos(3x) \\times 3$."),
  q("Combined Mathematics", "Hard", ["differentiation", "stationary points"], "For $y = x^3 - 3x$, the point $(1, -2)$ is a…",
    ["Maximum", "Minimum", "Point of inflection", "Not stationary"], 1,
    "$y' = 3x^2 - 3 = 0$ at $x = 1$; $y'' = 6x = 6 > 0$, so it's a minimum."),
  q("Combined Mathematics", "Easy", ["integration", "calculus"], "Find $\\int 4x^3\\,dx$.",
    ["$12x^2 + C$", "$x^4 + C$", "$4x^4 + C$", "$x^3 + C$"], 1,
    "$\\frac{4x^4}{4} + C = x^4 + C$."),
  q("Combined Mathematics", "Medium", ["integration", "calculus", "definite"], "Evaluate $\\int_0^2 3x^2\\,dx$.",
    ["4", "6", "8", "12"], 2,
    "$[x^3]_0^2 = 8 - 0 = 8$."),
  q("Combined Mathematics", "Easy", ["quadratics", "algebra"], "What are the roots of $x^2 - 5x + 6 = 0$?",
    ["2 and 3", "−2 and −3", "1 and 6", "−1 and 6"], 0,
    "It factorises as $(x-2)(x-3) = 0$."),
  q("Combined Mathematics", "Medium", ["quadratics", "discriminant"], "For which value of $k$ does $x^2 + 4x + k = 0$ have a repeated root?",
    ["2", "4", "8", "16"], 1,
    "A repeated root needs $b^2 - 4ac = 0$: $16 - 4k = 0 \\Rightarrow k = 4$."),
  q("Combined Mathematics", "Medium", ["trigonometry", "identities"], "Which of these equals $\\cos 2A$?",
    ["$2\\sin A\\cos A$", "$1 - 2\\sin^2 A$", "$1 + 2\\cos^2 A$", "$\\sin^2 A - \\cos^2 A$"], 1,
    "$\\cos 2A = 1 - 2\\sin^2 A$ (one of its three forms)."),
  q("Combined Mathematics", "Hard", ["trigonometry", "r formula"], "What is the maximum value of $3\\sin x + 4\\cos x$?",
    ["3", "4", "5", "7"], 2,
    "$R = \\sqrt{3^2 + 4^2} = 5$, so the maximum of $R\\sin(x + \\alpha)$ is 5."),

  // ── Biology ──
  q("Biology", "Easy", ["photosynthesis", "plants"], "Where do the light-dependent reactions of photosynthesis take place?",
    ["Stroma", "Thylakoid membranes", "Mitochondria", "Cytoplasm"], 1,
    "Chlorophyll in the thylakoid membranes absorbs light; the Calvin cycle happens in the stroma."),
  q("Biology", "Medium", ["photosynthesis", "plants"], "The oxygen released during photosynthesis comes from…",
    ["Carbon dioxide", "Glucose", "Water", "RuBP"], 2,
    "Photolysis splits water, releasing O₂. This was proven using isotope labelling."),
  q("Biology", "Easy", ["respiration", "cells"], "Where does glycolysis occur?",
    ["Mitochondrial matrix", "Cytoplasm", "Nucleus", "Inner mitochondrial membrane"], 1,
    "Glycolysis happens in the cytoplasm; the later stages happen in the mitochondria."),
  q("Biology", "Medium", ["respiration", "anaerobic"], "What is produced by anaerobic respiration in human muscle?",
    ["Ethanol and CO₂", "Lactate", "Glucose", "Oxygen"], 1,
    "Pyruvate is converted to lactate, regenerating NAD so glycolysis can continue."),
  q("Biology", "Easy", ["cells", "organelles"], "Which organelle is the site of protein synthesis?",
    ["Ribosome", "Lysosome", "Golgi apparatus", "Nucleolus"], 0,
    "Ribosomes translate mRNA into polypeptides."),
  q("Biology", "Medium", ["cells", "prokaryote"], "Which feature is found in prokaryotic cells but NOT in eukaryotic cells?",
    ["Ribosomes", "Cell membrane", "Plasmids", "Cytoplasm"], 2,
    "Plasmids are small circular DNA loops typical of bacteria. Both cell types have ribosomes, membranes and cytoplasm."),
  q("Biology", "Medium", ["dna", "genetics"], "If a DNA sample is 30% adenine, what percentage is cytosine?",
    ["30%", "20%", "40%", "70%"], 1,
    "A = T = 30%, so A + T = 60%, leaving 40% for C + G, so C = 20%."),
  q("Biology", "Hard", ["dna", "replication"], "Which enzyme joins Okazaki fragments on the lagging strand?",
    ["DNA helicase", "DNA polymerase", "DNA ligase", "RNA polymerase"], 2,
    "DNA ligase seals the gaps between fragments by forming phosphodiester bonds."),

  // ── General / study skills ──
  q("General", "Easy", ["study", "memory"], "Which technique is most effective for long-term retention?",
    ["Re-reading notes", "Highlighting", "Active recall (self-testing)", "Listening to music while studying"], 2,
    "Retrieval practice strengthens memory far more than passive review."),
  q("General", "Medium", ["study", "memory"], "Spaced repetition means…",
    ["Studying in one long session", "Reviewing at increasing intervals over time", "Leaving space between notes", "Studying only before exams"], 1,
    "Reviewing just before you'd forget, e.g. after 1, 3, 7 and 14 days."),
  q("General", "Medium", ["study", "practice"], "Interleaving practice means…",
    ["Practising one problem type until mastered", "Mixing different problem types in one session", "Studying with a partner", "Taking regular breaks"], 1,
    "Mixing problem types trains you to choose the right method, which is what exams test."),
];

/** Match an arbitrary topic phrase to bank tags. */
export function findQuestions(opts: { topic?: string; subject?: Subject; difficulty?: Difficulty | "Mixed" }): BankQuestion[] {
  const { topic, subject, difficulty } = opts;
  let pool = QUIZ_BANK;
  if (topic) {
    const words = topic.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 2);
    const tagged = pool.filter((qq) =>
      qq.tags.some((tag) => words.some((w) => tag.includes(w) || w.includes(tag))),
    );
    if (tagged.length) pool = tagged;
    else if (subject) pool = pool.filter((qq) => qq.subject === subject);
  } else if (subject) {
    pool = pool.filter((qq) => qq.subject === subject);
  }
  if (difficulty && difficulty !== "Mixed") {
    const byDiff = pool.filter((qq) => qq.difficulty === difficulty);
    if (byDiff.length >= 3) pool = byDiff;
  }
  return pool;
}

/** True when the offline bank has questions tagged for this topic phrase. */
export function bankCovers(topic: string): boolean {
  const words = topic.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 2);
  return QUIZ_BANK.some((qq) => qq.tags.some((tag) => words.some((w) => tag.includes(w) || w.includes(tag))));
}
