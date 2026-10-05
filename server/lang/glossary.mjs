// Sri Lankan student vocabulary → English retrieval terms.
//
// STATUS: PROVISIONAL. Written from common usage in Sri Lankan O/L and A/L
// classes. A Sinhala-speaking teacher should review and extend it, ideally
// against the NIE glossary of technical terms. Wrong entries here only affect
// retrieval (they add English search terms), never what the student reads.
//
// Sinhala entries are base dictionary forms; nlp.mjs stems them with the same
// stemmer it applies to the student's message, so inflections (වේගය / වේගයේ /
// වේගයෙන් / වේගයක්) all match one entry.

/** Sinhala-script subject / concept terms → English. */
export const SI_TERMS = {
  // subjects
  "භෞතික": "physics", "රසායන": "chemistry", "ජීව": "biology", "ගණිතය": "mathematics", "සංයුක්ත": "combined mathematics",
  "විද්\u200Dයාව": "science", "තොරතුරු තාක්ෂණය": "ict information technology", "ඉතිහාසය": "history", "භූගෝල": "geography",
  // physics / science
  "වේගය": "speed", "ප්\u200Dරවේගය": "velocity", "ත්වරණය": "acceleration", "මන්දනය": "deceleration retardation", "බලය": "force",
  "ශක්තිය": "energy", "ස්කන්ධය": "mass", "ගම්\u200Dයතාවය": "momentum", "කාර්යය": "work", "ජවය": "power", "පීඩනය": "pressure",
  "උෂ්ණත්වය": "temperature", "තාපය": "heat thermal", "තරංගය": "wave waves", "ආලෝකය": "light optics", "ශබ්දය": "sound",
  "විද්\u200Dයුතය": "electricity electric", "ධාරාව": "current", "විභවය": "potential", "ප්\u200Dරතිරෝධය": "resistance resistor",
  "චුම්බකය": "magnet magnetic magnetism", "පරමාණුව": "atom atomic", "අණුව": "molecule", "ගුරුත්වාකර්ෂණය": "gravity gravitation",
  "ඝර්ෂණය": "friction", "ඝනත්වය": "density", "පරාවර්තනය": "reflection", "වර්තනය": "refraction", "කම්පනය": "vibration oscillation",
  "සංඛ්\u200Dයාතය": "frequency", "තරංග ආයාමය": "wavelength", "ධාරිත්\u200Dරකය": "capacitor capacitance", "විස්ථාපනය": "displacement",
  "දෛශිකය": "vector vectors", "අදිශය": "scalar", "ප්\u200Dරක්ෂේපකය": "projectile", "චලිතය": "motion kinematics", "සමතුලිතතාව": "equilibrium",
  "ව්\u200Dයවර්තය": "torque moment", "ව්\u200Dයවර්ථය": "torque moment", "නියමය": "law", "නිව්ටන්": "newton", "වෝල්ටීයතාව": "voltage",
  "ඕම්": "ohm", "විකිරණශීලී": "radioactivity radioactive", "ඉලෙක්ට්\u200Dරෝනය": "electron", "ප්\u200Dරෝටෝනය": "proton", "නියුට්\u200Dරෝනය": "neutron",
  // chemistry
  "අම්ලය": "acid acids", "භස්මය": "base alkali", "ලවණය": "salt", "මවුලය": "mole", "ප්\u200Dරතික්\u200Dරියාව": "reaction",
  "ඔක්සිකරණය": "oxidation redox", "ඔක්සිහරණය": "reduction redox", "ද්\u200Dරාවණය": "solution", "සාන්ද්\u200Dරණය": "concentration",
  "විච්ඡේදනය": "electrolysis", "බන්ධනය": "bond bonding", "සංයුජතාව": "valency", "ආවර්තිතා": "periodic table", "සමස්ථානිකය": "isotope",
  "කාබනික": "organic", "අකාබනික": "inorganic", "හයිඩ්\u200Dරොකාබන": "hydrocarbon", "මූලද්\u200Dරව්\u200Dයය": "element", "සංයෝගය": "compound",
  "මිශ්\u200Dරණය": "mixture", "උත්ප්\u200Dරේරකය": "catalyst",
  // biology
  "සෛලය": "cell", "ප්\u200Dරභාසංශ්ලේෂණය": "photosynthesis", "ශ්වසනය": "respiration", "ප්\u200Dරවේණිය": "genetics heredity", "ජානය": "gene",
  "පරිණාමය": "evolution", "ආහාර": "food nutrition", "රුධිරය": "blood", "හෘදය": "heart", "පරිසරය": "ecology environment",
  "ප්\u200Dරජනනය": "reproduction", "එන්සයිමය": "enzyme", "ශාකය": "plant", "සත්ව": "animal",
  // mathematics
  "අවකලනය": "differentiation derivative", "අවකල": "differential differentiation", "අනුකලනය": "integration integral", "අනුකල": "integral integration",
  "ත්\u200Dරිකෝණමිතිය": "trigonometry", "සමීකරණය": "equation", "වර්ගජ": "quadratic", "ශ්\u200Dරිතය": "function", "සීමාව": "limit",
  "ඝාත": "indices powers exponent", "ලඝුගණකය": "logarithm", "න්\u200Dයාසය": "matrix matrices", "සම්භාවිතාව": "probability",
  "සංඛ්\u200Dයානය": "statistics", "මධ්\u200Dයන්\u200Dයය": "mean average", "මධ්\u200Dයස්ථය": "median", "අපගමනය": "deviation", "ප්\u200Dරස්තාරය": "graph",
  "ජ්\u200Dයාමිතිය": "geometry", "ත්\u200Dරිකෝණය": "triangle", "වෘත්තය": "circle", "සමාන්තර": "parallel", "ක්ෂේත්\u200Dරඵලය": "area", "පරිමාව": "volume",
  "භාගය": "fraction", "ප්\u200Dරතිශතය": "percentage", "අනුපාතය": "ratio", "ශ්\u200Dරේණිය": "series sequence", "බීජ": "algebra", "අසමානතාව": "inequality",
  "සංකීර්ණ": "complex numbers", "සාධකය": "factor factorisation", "වර්ගමූලය": "square root", "මූලය": "root", "ද්විපද": "binomial",
  "ක්\u200Dරමාරෝපණය": "permutation", "සංයෝජනය": "combination", "ස්පර්ශකය": "tangent", "අනුක්\u200Dරමය": "sequence",
  // ordinals, conservation, discriminant (PROVISIONAL spellings: please check against the NIE glossary)
  "පළමු": "first", "දෙවන": "second", "තෙවන": "third", "තුන්වන": "third", "සංස්ථිති": "conservation", "සංස්ථිතිය": "conservation", "ගම්\u200Dයතා": "momentum", "විවේචකය": "discriminant", "ප්\u200Dරවේග": "velocity", "ත්වරණ": "acceleration",
  // exam / study words
  "ප්\u200Dරශ්නපත්\u200Dරය": "paper past paper", "ප්\u200Dරශ්න": "questions question", "පසුගිය": "past", "ලකුණු": "marks marking", "පිළිතුර": "answer",
  "ලකුණු දීමේ": "marking scheme", "සාරාංශය": "summary", "සටහන්": "notes", "විභාගය": "exam examination", "පාඩම": "lesson", "ඒකකය": "unit",
};

/** Sinhala function words that signal the request type. Matched whole-word, after NFC. */
export const SI_INTENT = {
  "මොකක්ද": "what is", "මොකක්": "what is", "මොකද": "what", "කුමක්ද": "what is", "කුමක්": "what", "කියන්නේ": "meaning definition",
  "කොහොමද": "how", "කොහොම": "how", "කෙසේද": "how", "ඇයි": "why", "ඇයිද": "why",
  "පැහැදිලි": "explain", "විස්තර": "explain describe", "විසඳන්න": "solve", "විසඳමු": "solve", "සොයන්න": "find", "හොයන්නේ": "find",
  "ගණනය": "calculate", "ඔප්පු": "prove", "අර්ථ": "define definition", "උදාහරණ": "example", "උදාහරණයක්": "example",
  "සරලව": "simple simply", "සංසන්දනය": "compare comparison", "වෙනස": "difference", "සිංහලෙන්": "in sinhala", "ඉංග්\u200Dරීසියෙන්": "in english",
  "කරන්න": "", "කරමු": "", "දෙන්න": "give",
};

/** Typing shortcuts students use for Singlish → canonical Singlish spelling. */
export const SINGLISH_FIX = {
  krnna: "karanna", kranna: "karanna", krnn: "karanna", karnna: "karanna", krnne: "karanne", krnnd: "karannada", kiyla: "kiyala", kiyl: "kiyala",
  mkd: "mokakda", mkdd: "mokakda", mokada: "mokakda", mokakd: "mokakda", mokkda: "mokakda", kmd: "kohomada", kohomd: "kohomada",
  wla: "wala", walta: "walata", eke: "eka", ekk: "ekak", thmai: "thamai", nthnam: "nathnam", thiynne: "thiyenne", thiyne: "thiyenne",
  pahadili: "pahadili", pahdili: "pahadili", dnna: "denna", dnn: "denna", puluwn: "puluwan", plwn: "puluwan", hoynna: "hoyanna", blnna: "balanna",
  kiynne: "kiyanne", kynne: "kiyanne", ganan: "ganan", sinhalen: "sinhalen", shinhalen: "sinhalen", sinhlen: "sinhalen",
};

/** Singlish (romanised Sinhala) → English search terms. */
export const SINGLISH_TERMS = {
  mokakda: "what is", monawada: "what", kiyanne: "meaning", kohomada: "how", ai: "", karanna: "", karanne: "", karannada: "",
  pahadili: "explain", pahadilikaranna: "explain", saralawa: "simple simply", wenas: "difference", wenasa: "difference", nisa: "because why",
  hoyanna: "find", balanna: "", denna: "give", dennako: "give", ganan: "calculate", ganankaranna: "calculate", prashna: "question questions", prashne: "question",
  uththaraya: "answer", uththara: "answer", lakuna: "marks", lakunu: "marks", sinhalen: "in sinhala", uda: "", pahala: "",
  wegaya: "speed", wegay: "speed", pravegaya: "velocity", thwaranaya: "acceleration", balaya: "force", shakthiya: "energy", sakthiya: "energy",
  bhauthika: "physics", bouthika: "physics", rasayana: "chemistry", ganithaya: "mathematics maths", jeewa: "biology", vidyawa: "science",
  anukalanaya: "integration", awakalanaya: "differentiation", avakalanaya: "differentiation", samikaranaya: "equation", wargaja: "quadratic",
  thaapaya: "heat", dhara: "current", prathirodhaya: "resistance", pidanaya: "pressure", sankhyathaya: "frequency", tharangaya: "wave",
  prashnapathraya: "past paper", pasugiya: "past", wiyaya: "",
};

/** Romanised-Sinhala words that are (almost) never plain English. One of these in a short message is enough. */
export const SINGLISH_MARKERS = new Set([
  "mokakda", "monawada", "kohomada", "karanna", "karanne", "karannada", "kiyanne", "kiyala", "kiyanna", "denna", "dennako", "puluwan", "puluwanda",
  "therenne", "therenna", "theruna", "thiyenne", "thiyena", "hoyanna", "balanna", "ganna", "wala", "walata", "walin", "eka", "ekak", "ekata", "eke",
  "nathnam", "wenas", "pahadili", "saralawa", "sinhalen", "meka", "meke", "mekata", "kiyalada", "pahadilikaranna",
]);

/** Words that could also be names or English: they only count together with a marker or with each other. */
export const SINGLISH_WEAK = new Set(["nisa", "neda", "machan", "aney", "oya", "oyage", "mage", "mata", "godak", "tikak", "podi", "naha", "naa", "nathi", "thamai", "awa", "yanne", "wage", "hari", "eya", "ethakota", "api"]);
