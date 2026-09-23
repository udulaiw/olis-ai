// ─────────────────────────────────────────────
// OLIS Demo Knowledge Base
// A small, hand-written library that powers the $0 offline engine.
// Every entry is written at three depths so OLIS can adapt to the
// student's level and learning style without any AI API.
// ─────────────────────────────────────────────
import type { Subject } from "../../types";

export interface Topic {
  id: string;
  subject: Subject;
  title: string;
  /** Lower-case phrases that identify the topic in a message. */
  keywords: string[];
  oneLiner: string;
  /** Beginner-friendly analogy version. */
  beginner: string;
  /** Standard explanation (intermediate). */
  core: string;
  /** Extra depth for advanced students / detailed style. */
  advanced: string;
  /** Ordered steps for the step-by-step style. */
  steps: string[];
  examTips: string[];
  mistakes: string[];
  cards: [string, string][];
  check: string;
}

const md = String.raw;

export const TOPICS: Topic[] = [
  // ───────────────────────── PHYSICS ─────────────────────────
  {
    id: "newtons-laws",
    subject: "Physics",
    title: "Newton's Laws of Motion",
    keywords: ["newton's law", "newtons law", "newton law", "laws of motion", "newton", "inertia", "f=ma", "f = ma", "action and reaction", "action reaction"],
    oneLiner: "Three rules that connect forces to how objects move.",
    beginner: md`Think of a football on the ground.

- **It won't move by itself.** It stays still until someone kicks it. That's the **first law**: things keep doing what they're doing (resting or moving steadily) unless a force changes it.
- **A harder kick sends it faster.** A heavier ball needs a harder kick for the same result. That's the **second law**: $F = ma$.
- **Your foot feels the ball push back.** That's the **third law**: every push comes with an equal push in the opposite direction.`,
    core: md`### 1st law: Inertia
An object stays **at rest** or keeps moving at **constant velocity** unless a **resultant (net) force** acts on it. *Inertia* is this resistance to changes in motion, and mass measures it.

### 2nd law: $F = ma$
The resultant force on an object equals its mass times its acceleration:

$$F_{\text{net}} = ma$$

Force is measured in newtons (N), where $1\ \text{N} = 1\ \text{kg m s}^{-2}$. The acceleration is always in the **direction of the resultant force**.

### 3rd law: Action and reaction
If body A exerts a force on body B, then B exerts a force on A that is **equal in size, opposite in direction, and of the same type**. The two forces act on **different bodies**, so they never cancel each other out.

**Example:** A $2\ \text{kg}$ trolley is pulled with a net force of $6\ \text{N}$.
$a = F/m = 6/2 = 3\ \text{m s}^{-2}$.`,
    advanced: md`### Going deeper
- The more general form of the 2nd law is $F = \dfrac{dp}{dt}$, where $p = mv$ is momentum. $F = ma$ is the special case where mass is constant. Rockets, whose mass changes, need the momentum form.
- Newton's laws only hold in **inertial frames** (frames that aren't accelerating). Inside an accelerating car you "feel" a backwards push. This is a *pseudo-force* that appears because your frame of reference is accelerating.
- The third law is equivalent to **conservation of momentum** for an isolated system. Internal forces come in equal and opposite pairs, so they cancel when you add them over the whole system.`,
    steps: [
      "Draw the object on its own and mark **every force** acting on it (weight, normal reaction, friction, tension, applied forces).",
      "Choose a positive direction and resolve forces along it.",
      "Add them up to get the **resultant force** $F_{\\text{net}}$.",
      "If $F_{\\text{net}} = 0$, the object is in equilibrium (1st law): at rest or at constant velocity.",
      "If $F_{\\text{net}} \\neq 0$, use $F_{\\text{net}} = ma$ to find the acceleration (2nd law).",
      "For any interaction between two bodies, remember the partner force acts on the *other* body (3rd law).",
    ],
    examTips: [
      "Always use the **resultant** force in $F = ma$, not just one of the forces.",
      "When stating the 3rd law, say the forces are equal, opposite, of the **same type**, and act on **different bodies**. This is worth marks.",
      "Weight and the normal reaction are **not** a 3rd-law pair. They act on the same body.",
    ],
    mistakes: [
      "Thinking a moving object needs a force to *keep* moving. It only needs a force to *change* its motion.",
      "Cancelling action–reaction pairs. They act on different objects, so they can't cancel.",
    ],
    cards: [
      ["State Newton's first law.", "An object remains at rest or at constant velocity unless acted on by a resultant force."],
      ["Write Newton's second law in its general form.", "$F = \\dfrac{dp}{dt}$; for constant mass this becomes $F = ma$."],
      ["What is inertia?", "The tendency of an object to resist changes in its motion. Mass measures inertia."],
      ["Why don't action–reaction forces cancel?", "They act on different bodies."],
      ["Define 1 newton.", "The force that gives a 1 kg mass an acceleration of 1 m s⁻²."],
    ],
    check: "A book rests on a table. What is the 3rd-law partner of the book's weight?",
  },
  {
    id: "kinematics",
    subject: "Physics",
    title: "Kinematics & the SUVAT Equations",
    keywords: ["kinematics", "suvat", "equations of motion", "uniform acceleration", "velocity time graph", "displacement", "motion in a straight line", "acceleration"],
    oneLiner: "Describing motion with five quantities: s, u, v, a and t.",
    beginner: md`Imagine a bike ride. At any moment you can ask:
- how far you've gone (**displacement, s**),
- how fast you started (**initial velocity, u**),
- how fast you're going now (**final velocity, v**),
- how quickly your speed is changing (**acceleration, a**),
- how long it's been (**time, t**).

If the acceleration stays **constant**, knowing any **three** of these lets you work out the other two. That's the whole trick of SUVAT.`,
    core: md`For motion in a straight line with **constant acceleration**:

$$v = u + at$$
$$s = ut + \tfrac{1}{2}at^2$$
$$v^2 = u^2 + 2as$$
$$s = \tfrac{1}{2}(u + v)t$$
$$s = vt - \tfrac{1}{2}at^2$$

Each equation leaves out **one** of the five variables. Pick the equation that leaves out the variable you **don't know and don't need**.

**Graphs**
- Gradient of a displacement–time graph gives the **velocity**.
- Gradient of a velocity–time graph gives the **acceleration**.
- Area under a velocity–time graph gives the **displacement**.

**Example:** A car starts from rest and accelerates at $2\ \text{m s}^{-2}$ for $5\ \text{s}$.
$v = 0 + 2(5) = 10\ \text{m s}^{-1}$, and $s = \tfrac12(2)(5^2) = 25\ \text{m}$.`,
    advanced: md`### Going deeper
- The SUVAT equations come from integrating constant acceleration: $v = \int a\,dt = u + at$, then $s = \int v\,dt = ut + \tfrac12 at^2$.
- If the acceleration **isn't constant**, SUVAT doesn't apply. Use calculus instead: $v = \dfrac{ds}{dt}$ and $a = \dfrac{dv}{dt} = v\dfrac{dv}{ds}$.
- Vertical free-fall is the SUVAT case with $a = -g$ (taking up as positive). Choose a sign convention and stick to it.`,
    steps: [
      "List the five SUVAT variables and fill in the three you know (watch for hidden info: *from rest* means $u = 0$).",
      "Circle the variable you need to find.",
      "Identify the variable you neither know nor need, and pick the equation that leaves it out.",
      "Substitute with a consistent sign convention (e.g. up/right positive).",
      "Solve, then check the units and whether the answer makes sense.",
    ],
    examTips: [
      "Write down your list of s, u, v, a, t first. Examiners often give method marks for it.",
      "'Dropped' or 'from rest' means $u = 0$; 'comes to rest' means $v = 0$.",
      "For quadratics in $t$, reject negative times unless the physics allows them.",
    ],
    mistakes: [
      "Using SUVAT when the acceleration is changing.",
      "Mixing up signs for a ball thrown upwards (g should be negative if up is positive).",
    ],
    cards: [
      ["Which SUVAT equation has no $s$?", "$v = u + at$"],
      ["Which SUVAT equation has no $t$?", "$v^2 = u^2 + 2as$"],
      ["What does the area under a v–t graph represent?", "Displacement."],
      ["What does the gradient of a v–t graph represent?", "Acceleration."],
      ["Condition for SUVAT to be valid?", "Constant (uniform) acceleration in a straight line."],
    ],
    check: "A stone is dropped from 20 m. Taking g = 9.8 m s⁻², which SUVAT equation gives its speed on hitting the ground?",
  },
  {
    id: "work-energy-power",
    subject: "Physics",
    title: "Work, Energy & Power",
    keywords: ["work done", "kinetic energy", "potential energy", "conservation of energy", "power", "work energy", "energy conservation", "joule", "watt"],
    oneLiner: "Work transfers energy; power is how fast that transfer happens.",
    beginner: md`Pushing a heavy box across the floor makes you tired because you are **transferring energy**. That transfer is called **work**.

- Push harder or push further, and you do more work.
- A moving object carries **kinetic energy**; a raised object stores **gravitational potential energy**.
- **Power** is just *how quickly* you do the work. Two people can lift the same box, and the faster one is more powerful.`,
    core: md`**Work done** by a force $F$ moving through displacement $s$ at angle $\theta$ to the force:
$$W = Fs\cos\theta \quad (\text{J})$$

**Kinetic energy**: $E_k = \tfrac{1}{2}mv^2$

**Gravitational potential energy** (near Earth's surface): $\Delta E_p = mg\Delta h$

**Conservation of energy**: energy can't be created or destroyed, only transferred. Without friction, $\text{loss in } E_p = \text{gain in } E_k$.

**Power**: $P = \dfrac{W}{t} = Fv \quad (\text{W})$

**Efficiency** $= \dfrac{\text{useful output}}{\text{total input}} \times 100\%$

**Example:** A 0.5 kg ball falls 5 m from rest (ignore air resistance, $g = 9.8$):
$mgh = 0.5 \times 9.8 \times 5 = 24.5\ \text{J} = \tfrac12 mv^2 \Rightarrow v \approx 9.9\ \text{m s}^{-1}$.`,
    advanced: md`### Going deeper
- **Work–energy theorem**: the net work done on a body equals its change in kinetic energy, $W_{\text{net}} = \Delta E_k$.
- For a variable force, $W = \int F\,ds$, which is the area under a force–displacement graph (e.g. a spring: $W = \tfrac12 kx^2$).
- Friction is a *non-conservative* force: the work it does depends on the path taken, and it turns mechanical energy into thermal energy.`,
    steps: [
      "Identify the energy stores at the start and at the end (kinetic, gravitational, elastic…).",
      "Account for energy lost to friction or air resistance (work done against resistive forces).",
      "Write: energy at start = energy at end + energy lost.",
      "Substitute the formulas ($\\tfrac12 mv^2$, $mgh$…) and solve.",
      "For power, divide energy transferred by time, or use $P = Fv$ at constant speed.",
    ],
    examTips: [
      "Only the component of force **along** the displacement does work, so use $\\cos\\theta$.",
      "At constant velocity, driving force = resistive force, so $P = Fv$ uses the resistive force.",
      "State the principle of conservation of energy in words when a question asks you to 'explain'.",
    ],
    mistakes: [
      "Forgetting to square the velocity in $\\tfrac12 mv^2$.",
      "Saying work is done when a force acts but nothing moves (e.g. holding a bag still). No displacement means no work.",
    ],
    cards: [
      ["Formula for work done by a force at angle θ?", "$W = Fs\\cos\\theta$"],
      ["Kinetic energy formula?", "$E_k = \\tfrac12 mv^2$"],
      ["Two formulas for power?", "$P = W/t$ and $P = Fv$"],
      ["State the work–energy theorem.", "Net work done on a body equals its change in kinetic energy."],
      ["Unit of power?", "Watt (W) = J s⁻¹"],
    ],
    check: "A 60 kg student climbs 3 m of stairs in 4 s. What is their useful power output?",
  },
  {
    id: "momentum",
    subject: "Physics",
    title: "Momentum & Impulse",
    keywords: ["momentum", "impulse", "collision", "conservation of momentum", "elastic collision", "inelastic"],
    oneLiner: "Momentum = mass × velocity, and in a closed system it's always conserved.",
    beginner: md`A slow truck and a fast tennis ball are both hard to stop, for different reasons: one is heavy, one is fast. **Momentum** combines both ideas: $p = mv$.

When things collide, momentum doesn't disappear. It just gets **shared out** differently. That's why a cue ball can stop dead and pass all its momentum to another ball.`,
    core: md`**Momentum**: $p = mv$ (unit: $\text{kg m s}^{-1}$). It's a **vector**, so direction matters.

**Principle of conservation of momentum**: in a closed system (no external resultant force), total momentum before an interaction equals total momentum after it.
$$m_1u_1 + m_2u_2 = m_1v_1 + m_2v_2$$

**Impulse** = change in momentum = force × time:
$$F\Delta t = \Delta p = mv - mu$$
That's why airbags and crumple zones **increase the collision time**: a longer $\Delta t$ means a smaller force for the same change in momentum.

**Collisions**
- **Elastic**: kinetic energy is conserved as well.
- **Inelastic**: some kinetic energy is transferred to heat, sound or deformation (momentum is *still* conserved).`,
    advanced: md`### Going deeper
- Impulse is the area under a force–time graph: $\int F\,dt$.
- In a perfectly elastic head-on collision, the relative speed of approach equals the relative speed of separation.
- Newton's 2nd law in momentum form, $F = dp/dt$, is more fundamental than $F = ma$ and applies even when mass changes.`,
    steps: [
      "Choose a positive direction and give every velocity a sign.",
      "Write the total momentum before: $m_1u_1 + m_2u_2$.",
      "Write the total momentum after (if bodies stick together, use the combined mass).",
      "Set before = after and solve for the unknown.",
      "If asked whether the collision is elastic, compare the total kinetic energy before and after.",
    ],
    examTips: [
      "Always state the direction when giving a momentum or velocity answer.",
      "'Explain using momentum' questions about safety features want: longer time → same $\\Delta p$ → smaller force.",
    ],
    mistakes: [
      "Forgetting that a velocity in the opposite direction is negative.",
      "Assuming kinetic energy is conserved in every collision.",
    ],
    cards: [
      ["Define momentum.", "Mass × velocity, $p = mv$, a vector quantity."],
      ["Define impulse.", "Force × time = change in momentum, $F\\Delta t = \\Delta p$."],
      ["What is conserved in an inelastic collision?", "Momentum (and total energy), but not kinetic energy."],
      ["Why do crumple zones reduce injury?", "They increase the collision time, reducing the force for the same change in momentum."],
    ],
    check: "A 2 kg ball moving at 3 m/s hits a stationary 1 kg ball and they stick together. What is their combined velocity?",
  },
  {
    id: "electricity",
    subject: "Physics",
    title: "Current Electricity & Ohm's Law",
    keywords: ["ohm's law", "ohms law", "current", "voltage", "resistance", "circuit", "series", "parallel", "potential difference", "resistor", "electricity", "kirchhoff"],
    oneLiner: "How charge flows through circuits, and how voltage, current and resistance are linked.",
    beginner: md`Think of a circuit as water pipes:
- **Voltage (V)** is the *push*, like water pressure from a pump.
- **Current (I)** is *how much flows* per second.
- **Resistance (R)** is how *narrow* the pipe is.

Push harder and more flows; narrow the pipe and less flows. That's **Ohm's law**: $V = IR$.`,
    core: md`**Current**: rate of flow of charge, $I = \dfrac{Q}{t}$ (amperes, A).

**Potential difference**: energy transferred per unit charge, $V = \dfrac{W}{Q}$ (volts, V).

**Ohm's law**: for an ohmic conductor at constant temperature, $V \propto I$, so
$$V = IR$$

**Resistance of a wire**: $R = \dfrac{\rho L}{A}$, where $\rho$ is the resistivity.

**Series vs parallel**
| | Series | Parallel |
|---|---|---|
| Current | Same everywhere | Splits between branches |
| Voltage | Shared | Same across each branch |
| Total R | $R = R_1 + R_2 + \dots$ | $\dfrac1R = \dfrac1{R_1} + \dfrac1{R_2} + \dots$ |

**Power**: $P = VI = I^2R = \dfrac{V^2}{R}$`,
    advanced: md`### Going deeper
- **Kirchhoff's 1st law** (junction rule): the total current into a junction equals the total current out, which follows from conservation of charge.
- **Kirchhoff's 2nd law** (loop rule): the sum of EMFs around a loop equals the sum of the potential drops ($\sum \varepsilon = \sum IR$), which follows from conservation of energy.
- Real cells have **internal resistance** $r$: $\varepsilon = I(R + r)$, so the terminal p.d. $V = \varepsilon - Ir$ drops as the current increases.`,
    steps: [
      "Simplify the circuit: combine series and parallel resistors step by step into one total resistance.",
      "Find the total current from the supply: $I = V_{\\text{total}} / R_{\\text{total}}$.",
      "Work back out through the circuit: the current is the same in series parts and splits in parallel parts.",
      "Use $V = IR$ on each component to find the p.d. across it.",
      "Check: the p.d.s around any loop should add up to the supply EMF.",
    ],
    examTips: [
      "Adding a resistor in **parallel** always *decreases* the total resistance.",
      "Ohm's law only applies to ohmic conductors at constant temperature. Say this in 'state' questions.",
    ],
    mistakes: [
      "Adding parallel resistances directly instead of adding their reciprocals.",
      "Forgetting to flip the final reciprocal: $1/R = 0.5$ means $R = 2\\ \\Omega$.",
    ],
    cards: [
      ["State Ohm's law.", "For a conductor at constant temperature, current is directly proportional to the p.d. across it."],
      ["Total resistance of 4 Ω and 4 Ω in parallel?", "2 Ω"],
      ["Three formulas for electrical power?", "$P = VI = I^2R = V^2/R$"],
      ["Resistance of a wire formula?", "$R = \\rho L / A$"],
      ["Kirchhoff's first law is based on conservation of…?", "Charge."],
    ],
    check: "What happens to the total resistance when you add another resistor in parallel?",
  },
  {
    id: "waves",
    subject: "Physics",
    title: "Waves",
    keywords: ["wave", "wavelength", "frequency", "transverse", "longitudinal", "amplitude", "wave equation", "interference", "diffraction", "superposition"],
    oneLiner: "Waves carry energy from place to place without carrying matter with them.",
    beginner: md`Drop a stone in a pond. The ripples travel outward, but a floating leaf just bobs **up and down** and stays where it is. The wave moves **energy**, not the water itself.

- **Wavelength**: the distance from one crest to the next.
- **Frequency**: how many waves pass each second.
- More waves per second, each one wavelength long, means the wave travels faster: $v = f\lambda$.`,
    core: md`**Key quantities**
- Amplitude $A$: maximum displacement from equilibrium
- Wavelength $\lambda$: distance between two adjacent points in phase (m)
- Frequency $f$: oscillations per second (Hz); period $T = 1/f$

**Wave equation**:
$$v = f\lambda$$

**Types**
- **Transverse**: oscillations are perpendicular to the direction of energy transfer (light, waves on a string). They can be **polarised**.
- **Longitudinal**: oscillations are parallel to the direction of energy transfer (sound), with compressions and rarefactions.

**Wave behaviours**: reflection, refraction (a change of speed makes the wave change direction), diffraction (spreading through gaps, most noticeable when the gap ≈ λ), and interference (superposition of waves).`,
    advanced: md`### Going deeper
- **Superposition**: when waves meet, the resultant displacement is the vector sum of the individual displacements.
- **Constructive interference** occurs at a path difference of $n\lambda$; **destructive** at $(n + \tfrac12)\lambda$ (for coherent sources in phase).
- **Stationary waves** form when two identical waves travel in opposite directions, giving nodes and antinodes. On a string fixed at both ends, $L = n\dfrac{\lambda}{2}$.
- Intensity is proportional to amplitude squared: $I \propto A^2$.`,
    steps: [
      "Identify the type of wave (transverse or longitudinal) and what's oscillating.",
      "Read the amplitude and wavelength from a displacement–distance graph, and the period from a displacement–time graph.",
      "Find the frequency using $f = 1/T$.",
      "Use $v = f\\lambda$ to link speed, frequency and wavelength.",
      "For boundary problems: frequency stays the same, while speed and wavelength change.",
    ],
    examTips: [
      "When a wave enters a new medium, its **frequency doesn't change**. Examiners love testing this.",
      "Only transverse waves can be polarised. That's the classic evidence that light is transverse.",
    ],
    mistakes: ["Reading the wavelength from a displacement–*time* graph (that gives the period).", "Thinking the medium travels with the wave."],
    cards: [
      ["Wave equation?", "$v = f\\lambda$"],
      ["Transverse vs longitudinal?", "Transverse: oscillation ⟂ energy transfer. Longitudinal: oscillation ∥ energy transfer."],
      ["What stays constant when a wave refracts?", "Frequency."],
      ["Condition for constructive interference?", "Path difference = $n\\lambda$ (in-phase sources)."],
      ["Why can't sound be polarised?", "It's longitudinal. Only transverse waves can be polarised."],
    ],
    check: "A sound wave has frequency 500 Hz and speed 340 m/s. What's its wavelength?",
  },
  {
    id: "projectile",
    subject: "Physics",
    title: "Projectile Motion",
    keywords: ["projectile", "trajectory", "range", "thrown at an angle", "horizontal projection", "time of flight", "maximum height"],
    oneLiner: "Horizontal and vertical motion happen independently. Treat them separately.",
    beginner: md`Throw a ball forward. Two things happen **at the same time, independently**:
- sideways, it keeps moving at a **steady speed** (nothing pushes it sideways, ignoring air),
- up and down, it **falls** just like a dropped ball, pulled by gravity.

Combine the two and you get the curved path, a **parabola**.`,
    core: md`Resolve the launch velocity $u$ at angle $\theta$:
$$u_x = u\cos\theta, \qquad u_y = u\sin\theta$$

**Horizontal** (no acceleration, ignoring air resistance): $x = u_x t$

**Vertical** (constant acceleration $-g$): use SUVAT with $a = -g$.

**Useful results** (launch and landing at the same height):
- Time of flight: $T = \dfrac{2u\sin\theta}{g}$
- Maximum height: $H = \dfrac{u^2\sin^2\theta}{2g}$
- Range: $R = \dfrac{u^2\sin 2\theta}{g}$, which is maximum at $\theta = 45^\circ$

**Key link:** **time** is the only quantity shared by both directions.`,
    advanced: md`### Going deeper
- Eliminating $t$ gives the trajectory $y = x\tan\theta - \dfrac{g x^2}{2u^2\cos^2\theta}$, which is a parabola.
- Complementary angles (e.g. 30° and 60°) give the same range on level ground.
- With air resistance the path isn't a parabola: the range drops and the optimum angle falls below 45°.`,
    steps: [
      "Resolve the initial velocity into horizontal and vertical components.",
      "Vertical: use SUVAT with $a = -g$ to find the time (e.g. time to land or to reach the top).",
      "Horizontal: use distance = $u_x \\times t$ with that same time.",
      "At the highest point, the vertical velocity is zero, but the horizontal velocity is unchanged.",
      "Combine components with Pythagoras if you need the final speed.",
    ],
    examTips: ["At maximum height $v_y = 0$, which is often the key equation.", "Use the same time in both directions. It's the bridge between them."],
    mistakes: ["Using $u$ instead of its components in SUVAT.", "Thinking the velocity is zero at the top. Only the vertical component is."],
    cards: [
      ["Horizontal acceleration of a projectile (no air resistance)?", "Zero."],
      ["Range formula on level ground?", "$R = u^2\\sin 2\\theta / g$"],
      ["Angle for maximum range?", "45°"],
      ["What's the vertical velocity at maximum height?", "Zero."],
    ],
    check: "A ball is kicked horizontally off a 20 m cliff at 10 m/s. Which direction do you use to find how long it's in the air?",
  },

  // ───────────────────────── CHEMISTRY ─────────────────────────
  {
    id: "atomic-structure",
    subject: "Chemistry",
    title: "Atomic Structure",
    keywords: ["atomic structure", "atom", "proton", "neutron", "electron configuration", "isotope", "orbital", "subshell", "atomic number", "mass number"],
    oneLiner: "Atoms are a tiny dense nucleus of protons and neutrons surrounded by electrons in energy levels.",
    beginner: md`Picture an atom as a **tiny solar system** (not perfectly accurate, but a good start):
- the **nucleus** in the middle holds **protons** (+) and **neutrons** (no charge),
- **electrons** (−) sit around it in **energy levels** (shells).

The number of protons decides *which element* it is. Carbon always has 6.`,
    core: md`| Particle | Relative mass | Relative charge | Location |
|---|---|---|---|
| Proton | 1 | +1 | Nucleus |
| Neutron | 1 | 0 | Nucleus |
| Electron | 1/1836 | −1 | Orbitals |

- **Atomic number (Z)** = number of protons
- **Mass number (A)** = protons + neutrons
- **Isotopes**: same Z, different numbers of neutrons, so they have the same chemical properties but different masses.

**Electron configuration** fills subshells in order of energy:
$$1s \to 2s \to 2p \to 3s \to 3p \to 4s \to 3d \to 4p$$
Capacities: s = 2, p = 6, d = 10.

**Example:** Sodium (Z = 11): $1s^2\,2s^2\,2p^6\,3s^1$.`,
    advanced: md`### Going deeper
- **Aufbau principle**: fill the lowest energy orbitals first. **Hund's rule**: electrons occupy degenerate orbitals singly (with parallel spins) before pairing. **Pauli exclusion**: at most two electrons per orbital, with opposite spins.
- Exceptions: Cr is $[\text{Ar}]\,3d^5\,4s^1$ and Cu is $[\text{Ar}]\,3d^{10}\,4s^1$, because half-filled and full d-subshells are extra stable.
- When transition metals form ions, **4s electrons are lost before 3d**.
- **Ionisation energy** trends (the dips at the start of p-subshells and at paired p-electrons) are evidence for subshells.`,
    steps: [
      "Find Z from the periodic table. That's the number of protons (and of electrons in a neutral atom).",
      "Adjust the electron count for ions: add electrons for negative ions, remove them for positive ions.",
      "Fill subshells in energy order: 1s, 2s, 2p, 3s, 3p, 4s, 3d, 4p…",
      "Respect the capacities: s = 2, p = 6, d = 10.",
      "Check the exceptions (Cr, Cu) and remember that 4s empties first when forming ions.",
    ],
    examTips: ["Use the $[\\text{Ar}]$ shorthand to save time in configurations.", "Isotopes have **identical chemical properties** because they have the same electron configuration."],
    mistakes: ["Removing 3d electrons before 4s when forming transition-metal ions.", "Confusing mass number with relative atomic mass."],
    cards: [
      ["Define isotopes.", "Atoms of the same element with the same number of protons but different numbers of neutrons."],
      ["Electron configuration of Na?", "$1s^2\\,2s^2\\,2p^6\\,3s^1$"],
      ["Max electrons in a p subshell?", "6"],
      ["Why is Cu $[Ar]\\,3d^{10}\\,4s^1$?", "A full 3d subshell is more stable."],
      ["Which is lost first in Fe → Fe²⁺: 4s or 3d?", "4s"],
    ],
    check: "Write the electron configuration of Fe²⁺ (Fe has Z = 26).",
  },
  {
    id: "bonding",
    subject: "Chemistry",
    title: "Chemical Bonding",
    keywords: ["bonding", "ionic bond", "covalent bond", "metallic bond", "electronegativity", "vsepr", "shape of molecules", "intermolecular", "hydrogen bond", "polar"],
    oneLiner: "Atoms bond to reach more stable electron arrangements, by transferring, sharing or pooling electrons.",
    beginner: md`Atoms are "happiest" with a full outer shell. They get there in three ways:
- **Ionic**: one atom *gives* electrons to another (metal + non-metal), like Na giving one to Cl.
- **Covalent**: atoms *share* electrons (non-metals), like two H atoms sharing a pair.
- **Metallic**: metal atoms *pool* their outer electrons into a "sea" that holds them together.`,
    core: md`**Ionic bonding**: electrostatic attraction between oppositely charged ions in a giant lattice. It gives high melting points, and the compounds conduct when molten or dissolved.

**Covalent bonding**: a shared pair of electrons attracted to both nuclei. Simple molecules have low melting points (only weak intermolecular forces need breaking); giant covalent structures (diamond, SiO₂) have very high ones.

**Metallic bonding**: attraction between positive metal ions and delocalised electrons. It explains conductivity and malleability.

**Electronegativity**: the ability of an atom to attract a bonding pair of electrons. Big differences make a bond **polar**.

**Shapes (VSEPR)**: electron pairs repel and get as far apart as possible, and lone pairs repel more than bonding pairs.
| Pairs (bonding + lone) | Shape | Angle |
|---|---|---|
| 4 + 0 | Tetrahedral (CH₄) | 109.5° |
| 3 + 1 | Trigonal pyramidal (NH₃) | 107° |
| 2 + 2 | Bent (H₂O) | 104.5° |`,
    advanced: md`### Going deeper
- **Intermolecular forces** (weakest to strongest): London (induced dipole) forces, then permanent dipole–dipole forces, then hydrogen bonds.
- Hydrogen bonding needs H bonded directly to **N, O or F**, plus a lone pair on N, O or F in a neighbouring molecule. It explains why water's boiling point is unusually high.
- A molecule can have polar bonds and still be **non-polar overall** if its symmetry cancels the dipoles (CO₂, CCl₄).
- **Dative covalent** bonds form when both shared electrons come from one atom (e.g. NH₄⁺).`,
    steps: [
      "Decide the bond type from the elements: metal + non-metal → ionic, non-metal + non-metal → covalent, metal only → metallic.",
      "For a covalent molecule, count the electron pairs around the central atom.",
      "Split them into bonding pairs and lone pairs.",
      "Use VSEPR to predict the shape. Each lone pair squeezes the bond angle by about 2.5°.",
      "Check the electronegativity differences and symmetry to decide whether the molecule is polar.",
    ],
    examTips: ["When explaining melting points, say **which** forces are broken: covalent bonds or intermolecular forces.", "Draw lone pairs on shape diagrams. They're often a marking point."],
    mistakes: ["Saying covalent bonds break when simple molecules melt (only intermolecular forces break).", "Forgetting lone pairs when predicting shape."],
    cards: [
      ["Define electronegativity.", "The ability of an atom to attract the bonding pair of electrons in a covalent bond."],
      ["Shape and bond angle of NH₃?", "Trigonal pyramidal, about 107°."],
      ["Three elements that allow hydrogen bonding?", "N, O, F"],
      ["Why is CO₂ non-polar?", "It's linear and symmetrical, so the bond dipoles cancel."],
      ["What is metallic bonding?", "Attraction between positive metal ions and a sea of delocalised electrons."],
    ],
    check: "Why does ice float on water? (Hint: hydrogen bonds.)",
  },
  {
    id: "mole-concept",
    subject: "Chemistry",
    title: "The Mole Concept",
    keywords: ["mole", "moles", "avogadro", "molar mass", "stoichiometry", "concentration", "molarity", "empirical formula", "limiting reagent", "yield"],
    oneLiner: "The mole lets chemists count particles by weighing them.",
    beginner: md`A **dozen** means 12 of anything. A **mole** is the same idea, just a *much* bigger number: $6.02 \times 10^{23}$.

Atoms are too tiny to count one by one, so chemists weigh them instead. **One mole of any substance weighs its formula mass in grams.** For example, 12 g of carbon is one mole of carbon atoms.`,
    core: md`**Avogadro constant**: $N_A = 6.02 \times 10^{23}\ \text{mol}^{-1}$

**Core equations**
$$n = \frac{m}{M} \qquad n = cV \qquad N = nN_A$$
where $n$ = moles, $m$ = mass (g), $M$ = molar mass (g mol⁻¹), $c$ = concentration (mol dm⁻³), $V$ = volume (dm³).

**Gas volume** at r.t.p.: $1\ \text{mol} \approx 24\ \text{dm}^3$ (or use $pV = nRT$).

**Reacting masses** (the "mole bridge"):
1. Convert the given mass → moles
2. Use the equation's **mole ratio**
3. Convert moles → the required mass

**Example:** How much CO₂ comes from 10 g of CaCO₃? ($\text{CaCO}_3 \to \text{CaO} + \text{CO}_2$)
$n = 10/100 = 0.1\ \text{mol}$, the ratio is 1 : 1, so the mass of CO₂ is $0.1 \times 44 = 4.4\ \text{g}$.`,
    advanced: md`### Going deeper
- **Limiting reagent**: divide each reactant's moles by its coefficient in the equation. The smallest value is limiting.
- **Percentage yield** $= \dfrac{\text{actual}}{\text{theoretical}} \times 100\%$; **atom economy** $= \dfrac{M_r(\text{desired product})}{\sum M_r(\text{all products})} \times 100\%$.
- For the ideal gas equation in SI units, $p$ is in Pa and $V$ in m³ ($1\ \text{dm}^3 = 10^{-3}\ \text{m}^3$).`,
    steps: [
      "Write the balanced equation.",
      "Convert what you're given into moles ($m/M$, $cV$, or gas volume ÷ 24).",
      "Use the mole ratio from the equation to find moles of the target substance.",
      "Convert back into the unit you need (mass, volume or concentration).",
      "Check significant figures and units (cm³ → dm³: divide by 1000).",
    ],
    examTips: ["Show every conversion step. Each is usually a method mark.", "Convert cm³ to dm³ before using $n = cV$."],
    mistakes: ["Forgetting to divide cm³ by 1000.", "Skipping the mole ratio and going straight from mass to mass."],
    cards: [
      ["Avogadro constant?", "$6.02 \\times 10^{23}\\ \\text{mol}^{-1}$"],
      ["Moles from mass?", "$n = m/M$"],
      ["Moles from a solution?", "$n = cV$ (V in dm³)"],
      ["Molar gas volume at r.t.p.?", "24 dm³ mol⁻¹"],
      ["How do you identify the limiting reagent?", "Moles ÷ coefficient; the smallest is limiting."],
    ],
    check: "How many moles are in 25 cm³ of 0.2 mol dm⁻³ NaOH?",
  },
  {
    id: "organic-chemistry",
    subject: "Chemistry",
    title: "Introduction to Organic Chemistry",
    keywords: ["organic chemistry", "organic", "functional group", "homologous series", "alkane", "alkene", "alcohol", "isomer", "iupac", "hydrocarbon", "carboxylic acid", "naming"],
    oneLiner: "The chemistry of carbon compounds, organised by functional groups.",
    beginner: md`Carbon is like a **LEGO brick with four connectors**: it can bond to four things at once, including other carbons. That's why it can build chains, rings and millions of different molecules.

Chemists organise all these molecules into **families** (homologous series). Every member of a family has the same "business end", called the **functional group**, so they react in similar ways.`,
    core: md`**Homologous series**: a family of compounds with the **same functional group** and **general formula**, where each member differs by CH₂. Physical properties follow a gradual trend (e.g. boiling point rises with chain length).

| Family | Functional group | General formula | Example |
|---|---|---|---|
| Alkanes | C–C only | $\text{C}_n\text{H}_{2n+2}$ | Ethane |
| Alkenes | C=C | $\text{C}_n\text{H}_{2n}$ | Ethene |
| Alcohols | –OH | $\text{C}_n\text{H}_{2n+1}\text{OH}$ | Ethanol |
| Carboxylic acids | –COOH | $\text{C}_n\text{H}_{2n+1}\text{COOH}$ | Ethanoic acid |
| Haloalkanes | –X (Cl, Br, I) | $\text{C}_n\text{H}_{2n+1}\text{X}$ | Chloromethane |

**Naming (IUPAC)**: the stem gives the chain length (meth-, eth-, prop-, but-, pent-), and the suffix or prefix gives the functional group. Number the chain to give the functional group the **lowest** number.

**Isomers**
- **Structural**: same molecular formula, different structural formula (chain, position or functional-group isomers).
- **Stereoisomers**: same structural formula, different spatial arrangement (E/Z around C=C, optical isomers).`,
    advanced: md`### Going deeper
- **E/Z isomerism** needs restricted rotation around C=C **and** two different groups on each carbon of the double bond. Use the CIP priority rules to assign E or Z.
- **Optical isomers** arise from a **chiral centre**: a carbon bonded to four different groups. The two enantiomers rotate plane-polarised light in opposite directions.
- **Reaction mechanisms**: alkanes undergo free-radical substitution, alkenes electrophilic addition, and haloalkanes nucleophilic substitution. Knowing the *type of attacking species* predicts the mechanism.`,
    steps: [
      "Find the longest continuous carbon chain. That gives the stem name.",
      "Identify the functional group. That gives the suffix (or prefix for halogens).",
      "Number the chain so the functional group gets the lowest possible number.",
      "Name and number any side chains (methyl, ethyl…) in alphabetical order.",
      "Assemble: e.g. 2-methylpropan-1-ol.",
    ],
    examTips: ["Use hyphens between numbers and letters and commas between numbers (2,3-dimethylbutane).", "For isomers, draw **displayed formulae** to avoid drawing the same molecule twice."],
    mistakes: ["Choosing a chain that isn't the longest because of how it's drawn.", "Numbering from the wrong end."],
    cards: [
      ["Define a homologous series.", "A family with the same functional group and general formula, each member differing by CH₂."],
      ["General formula of alkenes?", "$\\text{C}_n\\text{H}_{2n}$"],
      ["Functional group of carboxylic acids?", "–COOH"],
      ["What are structural isomers?", "Same molecular formula, different structural formula."],
      ["What is a chiral centre?", "A carbon atom bonded to four different groups."],
    ],
    check: "Name CH₃CH(OH)CH₃.",
  },
  {
    id: "acids-bases",
    subject: "Chemistry",
    title: "Acids, Bases & pH",
    keywords: ["acid", "base", "ph", "alkali", "neutralisation", "neutralization", "bronsted", "buffer", "titration", "ka", "strong acid", "weak acid"],
    oneLiner: "Acids donate protons, bases accept them, and pH measures the H⁺ concentration.",
    beginner: md`Lemon juice tastes sour and soap feels slippery. They sit at opposite ends of the **pH scale** (0–14):
- below 7 is **acidic** (lots of H⁺ ions),
- exactly 7 is **neutral** (pure water),
- above 7 is **alkaline** (lots of OH⁻ ions).

Mix an acid and an alkali and they cancel each other out. That's **neutralisation**, and it makes a salt and water.`,
    core: md`**Brønsted–Lowry definitions**
- Acid = **proton (H⁺) donor**
- Base = **proton acceptor**

**Strong vs weak**
- Strong acids **fully** dissociate in water (HCl, HNO₃, H₂SO₄).
- Weak acids only **partially** dissociate (CH₃COOH), setting up an equilibrium.

**pH**:
$$\text{pH} = -\log_{10}[\text{H}^+]$$
For a strong monoprotic acid, $[\text{H}^+] = [\text{acid}]$. So 0.01 mol dm⁻³ HCl has pH = 2.

**Neutralisation**: $\text{H}^+ + \text{OH}^- \to \text{H}_2\text{O}$

**Typical reactions**: acid + metal → salt + hydrogen; acid + carbonate → salt + water + CO₂; acid + base → salt + water.`,
    advanced: md`### Going deeper
- **Weak acids**: $K_a = \dfrac{[\text{H}^+][\text{A}^-]}{[\text{HA}]}$ and, approximately, $[\text{H}^+] = \sqrt{K_a[\text{HA}]}$.
- **Ionic product of water**: $K_w = [\text{H}^+][\text{OH}^-] = 1.0 \times 10^{-14}$ at 298 K. Use it to find the pH of strong bases.
- **Buffers** (a weak acid plus its conjugate base) resist pH change. $\text{pH} = \text{p}K_a + \log\dfrac{[\text{A}^-]}{[\text{HA}]}$.`,
    steps: [
      "Decide whether the acid or base is strong or weak.",
      "Strong acid: $[\\text{H}^+]$ = concentration × number of H⁺ released per molecule.",
      "Strong base: find $[\\text{OH}^-]$, then $[\\text{H}^+] = K_w / [\\text{OH}^-]$.",
      "Weak acid: use $[\\text{H}^+] = \\sqrt{K_a \\times [\\text{HA}]}$.",
      "Calculate pH $= -\\log_{10}[\\text{H}^+]$ and sanity-check: acids below 7, bases above 7.",
    ],
    examTips: ["'Strong' means *fully dissociated*, not *concentrated*. Keep these two ideas separate.", "Give pH values to 2 decimal places unless told otherwise."],
    mistakes: ["Confusing strong with concentrated.", "Forgetting the minus sign in $-\\log_{10}$."],
    cards: [
      ["Brønsted–Lowry acid?", "A proton (H⁺) donor."],
      ["pH formula?", "$\\text{pH} = -\\log_{10}[\\text{H}^+]$"],
      ["pH of 0.001 mol dm⁻³ HCl?", "3"],
      ["Strong vs weak acid?", "Strong acids fully dissociate; weak acids partially dissociate."],
      ["What is a buffer?", "A solution that resists changes in pH when small amounts of acid or base are added."],
    ],
    check: "What's the pH of 0.1 mol dm⁻³ HNO₃?",
  },
  {
    id: "reaction-rates",
    subject: "Chemistry",
    title: "Rates of Reaction",
    keywords: ["rate of reaction", "reaction rate", "collision theory", "activation energy", "catalyst", "maxwell boltzmann", "kinetics"],
    oneLiner: "Reactions happen when particles collide with enough energy and the right orientation.",
    beginner: md`Think of a crowded dance floor where two people have to bump into each other *hard enough* to "react".

You get more successful bumps when there are:
- **more people** (higher concentration),
- **faster movers** (higher temperature),
- **more floor edge** exposed (smaller pieces mean a bigger surface area),
- a **helper** who makes the bump easier (a catalyst).`,
    core: md`**Collision theory**: particles must collide **with energy ≥ activation energy** ($E_a$) and with the **correct orientation**.

**Factors that increase the rate**
| Factor | Why |
|---|---|
| Concentration / pressure | More particles per volume → more frequent collisions |
| Surface area | More exposed particles → more frequent collisions |
| Temperature | Particles gain energy → **more collisions exceed $E_a$** (the main effect) and they collide more often |
| Catalyst | Provides an alternative pathway with **lower $E_a$** |

**Maxwell–Boltzmann distribution**: at a higher temperature the curve flattens and shifts right, so a much larger area lies beyond $E_a$.`,
    advanced: md`### Going deeper
- **Rate equation**: $\text{rate} = k[\text{A}]^m[\text{B}]^n$. The orders $m$ and $n$ are found by experiment, not from the balanced equation.
- **Arrhenius equation**: $k = Ae^{-E_a/RT}$, and plotting $\ln k$ against $1/T$ gives a gradient of $-E_a/R$.
- The **rate-determining step** is the slowest step in a mechanism. Only species up to and including it appear in the rate equation.`,
    steps: [
      "Identify which factor changed (concentration, temperature, surface area or catalyst).",
      "State the effect on collision **frequency** or on the **proportion of particles with $E \\ge E_a$**.",
      "Link that to the number of **successful collisions per second**.",
      "Conclude the effect on rate.",
      "If there's a Maxwell–Boltzmann diagram, mark $E_a$ and compare the shaded areas.",
    ],
    examTips: ["Always say 'more **successful** collisions **per unit time**'. 'More collisions' alone loses marks.", "A catalyst does **not** change $\\Delta H$ or the position of equilibrium."],
    mistakes: ["Saying a catalyst gives particles more energy.", "Saying temperature only increases collision frequency (the energy effect matters more)."],
    cards: [
      ["What is activation energy?", "The minimum energy colliding particles need to react."],
      ["How does a catalyst increase rate?", "It provides an alternative pathway with a lower activation energy."],
      ["Main reason temperature increases rate?", "More particles have energy ≥ Eₐ."],
      ["Arrhenius equation?", "$k = Ae^{-E_a/RT}$"],
    ],
    check: "Why does powdered marble react faster with acid than a single marble chip?",
  },

  // ───────────────────────── COMBINED MATHEMATICS ─────────────────────────
  {
    id: "differentiation",
    subject: "Combined Mathematics",
    title: "Differentiation",
    keywords: ["differentiation", "differentiate", "derivative", "gradient of a curve", "dy/dx", "rate of change", "chain rule", "product rule", "quotient rule", "stationary point", "tangent"],
    oneLiner: "Differentiation finds the rate of change, or the gradient of a curve at any point.",
    beginner: md`On a straight road, the slope is the same everywhere. On a **hilly** road, the steepness keeps changing.

Differentiation is a tool that tells you **exactly how steep the curve is at any single point**. It's also how you find "how fast something is changing right now", like your speed at one instant.`,
    core: md`**Definition**: $\dfrac{dy}{dx} = \displaystyle\lim_{h\to 0}\frac{f(x+h) - f(x)}{h}$

**Power rule**: $\dfrac{d}{dx}(x^n) = nx^{n-1}$

**Standard results**
| $f(x)$ | $f'(x)$ |
|---|---|
| $x^n$ | $nx^{n-1}$ |
| $e^x$ | $e^x$ |
| $\ln x$ | $\dfrac1x$ |
| $\sin x$ | $\cos x$ |
| $\cos x$ | $-\sin x$ |

**Rules**
- Chain: $\dfrac{dy}{dx} = \dfrac{dy}{du}\cdot\dfrac{du}{dx}$
- Product: $(uv)' = u'v + uv'$
- Quotient: $\left(\dfrac uv\right)' = \dfrac{u'v - uv'}{v^2}$

**Example:** $y = 3x^4 - 5x^2 + 7 \Rightarrow \dfrac{dy}{dx} = 12x^3 - 10x$`,
    advanced: md`### Going deeper
- **Stationary points**: solve $\dfrac{dy}{dx} = 0$. If $\dfrac{d^2y}{dx^2} > 0$ it's a minimum; if $< 0$ it's a maximum; if $= 0$, test further.
- **Implicit differentiation**: differentiate both sides with respect to $x$, treating $y$ as a function of $x$ (e.g. $\frac{d}{dx}(y^2) = 2y\frac{dy}{dx}$).
- **Connected rates of change** chain several derivatives together, e.g. $\dfrac{dV}{dt} = \dfrac{dV}{dr}\cdot\dfrac{dr}{dt}$.`,
    steps: [
      "Rewrite the function in index form (e.g. $\\sqrt{x} = x^{1/2}$, $\\frac{1}{x^2} = x^{-2}$).",
      "Identify the structure: a sum of terms, a product, a quotient or a composite (function of a function).",
      "Apply the matching rule (power, product, quotient or chain).",
      "Simplify the result.",
      "If needed, substitute an $x$-value to get the gradient at a point, or set it to zero for stationary points.",
    ],
    examTips: ["Rewrite roots and fractions as powers **before** differentiating.", "For stationary points, always state both coordinates and their nature."],
    mistakes: ["Forgetting the chain rule's inner derivative, e.g. $\\frac{d}{dx}\\sin(3x) = 3\\cos(3x)$.", "Differentiating a constant to anything other than 0."],
    cards: [
      ["Power rule?", "$\\frac{d}{dx}x^n = nx^{n-1}$"],
      ["Derivative of $\\ln x$?", "$\\frac{1}{x}$"],
      ["Product rule?", "$(uv)' = u'v + uv'$"],
      ["Second-derivative test for a minimum?", "$\\frac{d^2y}{dx^2} > 0$"],
      ["Derivative of $\\cos x$?", "$-\\sin x$"],
    ],
    check: "Differentiate $y = x^3 - 6x^2 + 9x$ and find its stationary points.",
  },
  {
    id: "integration",
    subject: "Combined Mathematics",
    title: "Integration",
    keywords: ["integration", "integrate", "integral", "antiderivative", "area under a curve", "definite integral", "indefinite integral", "by parts", "substitution"],
    oneLiner: "Integration reverses differentiation and finds areas under curves.",
    beginner: md`If differentiation asks "how fast is it changing?", integration asks "**how much has built up in total?**"

If you know your speed at every moment, integration adds up all those tiny bits of distance to give the **total distance**. On a graph, that total is the **area under the curve**.`,
    core: md`**Power rule** (reverse of differentiation):
$$\int x^n\,dx = \frac{x^{n+1}}{n+1} + C, \qquad n \ne -1$$

**Standard results**
| $f(x)$ | $\int f(x)\,dx$ |
|---|---|
| $x^{-1}$ | $\ln\lvert x\rvert + C$ |
| $e^x$ | $e^x + C$ |
| $\sin x$ | $-\cos x + C$ |
| $\cos x$ | $\sin x + C$ |

**Definite integral** (area between $x = a$ and $x = b$):
$$\int_a^b f(x)\,dx = F(b) - F(a)$$

**Example:** $\displaystyle\int_0^2 3x^2\,dx = \big[x^3\big]_0^2 = 8 - 0 = 8$`,
    advanced: md`### Going deeper
- **Substitution**: choose $u = g(x)$ so the integral becomes simpler. Change the limits too for definite integrals.
- **By parts**: $\int u\,\dfrac{dv}{dx}\,dx = uv - \int v\,\dfrac{du}{dx}\,dx$. Choose $u$ to be something that gets simpler when differentiated (LIATE is a helpful guide).
- Area **below** the x-axis comes out negative. Split the integral at the roots and take absolute values for the total area.`,
    steps: [
      "Rewrite each term in index form.",
      "Increase each power by 1 and divide by the new power.",
      "For an indefinite integral, add $+C$.",
      "For a definite integral, substitute the upper limit, then the lower, and subtract.",
      "For areas, check whether the curve dips below the x-axis within the limits.",
    ],
    examTips: ["Never forget $+C$ on indefinite integrals. It's a common lost mark.", "Show the square-bracket step $[F(x)]_a^b$ before substituting."],
    mistakes: ["Using the power rule for $x^{-1}$ (it gives division by zero; use $\\ln|x|$).", "Subtracting in the wrong order: it's upper minus lower."],
    cards: [
      ["$\\int x^n\\,dx$?", "$\\frac{x^{n+1}}{n+1} + C$, for $n \\neq -1$"],
      ["$\\int \\frac{1}{x}\\,dx$?", "$\\ln|x| + C$"],
      ["$\\int \\cos x\\,dx$?", "$\\sin x + C$"],
      ["Integration by parts formula?", "$\\int u\\,v'\\,dx = uv - \\int v\\,u'\\,dx$"],
      ["Why split an area integral at the roots?", "Area below the x-axis is negative and would cancel positive area."],
    ],
    check: "Find $\\int_1^3 (2x + 1)\\,dx$.",
  },
  {
    id: "quadratics",
    subject: "Combined Mathematics",
    title: "Quadratic Equations",
    keywords: ["quadratic", "discriminant", "completing the square", "quadratic formula", "roots", "factorise", "factorize", "parabola"],
    oneLiner: "Equations of the form ax² + bx + c = 0, with up to two solutions.",
    beginner: md`A quadratic draws a **U-shaped curve** (a parabola). Solving $ax^2 + bx + c = 0$ just means finding **where that U crosses the x-axis**.

It can cross **twice**, **touch once**, or **miss completely**, so a quadratic has 2, 1 or 0 real solutions.`,
    core: md`**Standard form**: $ax^2 + bx + c = 0$, $a \ne 0$

**Three methods**
1. **Factorising**: $x^2 - 5x + 6 = (x-2)(x-3) = 0 \Rightarrow x = 2, 3$
2. **Completing the square**: $x^2 + bx = \left(x + \tfrac b2\right)^2 - \tfrac{b^2}{4}$
3. **Quadratic formula**:
$$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$

**Discriminant** $\Delta = b^2 - 4ac$
- $\Delta > 0$: two distinct real roots
- $\Delta = 0$: one repeated root
- $\Delta < 0$: no real roots

**Sum and product of roots**: $\alpha + \beta = -\dfrac ba$, $\alpha\beta = \dfrac ca$`,
    advanced: md`### Going deeper
- Completing the square gives the vertex form $a(x - h)^2 + k$, so the turning point is $(h, k)$.
- **Symmetric functions of the roots**: $\alpha^2 + \beta^2 = (\alpha + \beta)^2 - 2\alpha\beta$, which is useful for forming new equations whose roots are related to the old ones.
- **Quadratic inequalities**: find the roots, sketch the parabola, and read off the region. Don't divide by a variable of unknown sign.`,
    steps: [
      "Rearrange into $ax^2 + bx + c = 0$ and identify $a$, $b$ and $c$.",
      "Compute the discriminant $b^2 - 4ac$ to see how many real roots there are.",
      "Try factorising. If it doesn't factorise nicely, use the formula.",
      "Substitute carefully into $x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$, keeping track of signs.",
      "Verify by substituting a root back into the original equation.",
    ],
    examTips: ["Write down $a$, $b$ and $c$ explicitly before using the formula. It stops sign errors.", "'Show that it has no real roots' means: show $b^2 - 4ac < 0$."],
    mistakes: ["Losing the minus sign in $-b$ when $b$ is negative.", "Dividing only part of the numerator by $2a$."],
    cards: [
      ["Quadratic formula?", "$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$"],
      ["Condition for two distinct real roots?", "$b^2 - 4ac > 0$"],
      ["Sum of roots?", "$-b/a$"],
      ["Product of roots?", "$c/a$"],
    ],
    check: "Solve $2x^2 - 5x - 3 = 0$.",
  },
  {
    id: "trigonometry",
    subject: "Combined Mathematics",
    title: "Trigonometric Identities",
    keywords: ["trigonometry", "trig", "sine", "cosine", "tangent", "trig identity", "identities", "sin^2", "double angle", "compound angle", "radian"],
    oneLiner: "Relationships between sin, cos and tan that are true for every angle.",
    beginner: md`Take a right-angled triangle:
- $\sin\theta = \dfrac{\text{opposite}}{\text{hypotenuse}}$, $\cos\theta = \dfrac{\text{adjacent}}{\text{hypotenuse}}$, $\tan\theta = \dfrac{\text{opposite}}{\text{adjacent}}$

An **identity** is a rule that works for *every* angle, not just one. The most famous comes straight from Pythagoras: $\sin^2\theta + \cos^2\theta = 1$.`,
    core: md`**Fundamental identities**
$$\tan\theta = \frac{\sin\theta}{\cos\theta}, \qquad \sin^2\theta + \cos^2\theta = 1$$
$$1 + \tan^2\theta = \sec^2\theta, \qquad 1 + \cot^2\theta = \csc^2\theta$$

**Compound angles**
$$\sin(A \pm B) = \sin A\cos B \pm \cos A\sin B$$
$$\cos(A \pm B) = \cos A\cos B \mp \sin A\sin B$$

**Double angles**
$$\sin 2A = 2\sin A\cos A$$
$$\cos 2A = \cos^2 A - \sin^2 A = 2\cos^2 A - 1 = 1 - 2\sin^2 A$$

**Radians**: $\pi\ \text{rad} = 180^\circ$`,
    advanced: md`### Going deeper
- **R-formula**: $a\sin\theta + b\cos\theta = R\sin(\theta + \alpha)$, where $R = \sqrt{a^2 + b^2}$ and $\tan\alpha = b/a$. Use it for max/min problems and for solving equations.
- **General solutions**: $\sin\theta = \sin\alpha \Rightarrow \theta = n\pi + (-1)^n\alpha$; $\cos\theta = \cos\alpha \Rightarrow \theta = 2n\pi \pm \alpha$; $\tan\theta = \tan\alpha \Rightarrow \theta = n\pi + \alpha$.
- Pick the form of $\cos 2A$ that matches the rest of the equation, so everything ends up in terms of *one* function.`,
    steps: [
      "Look at what's in the equation: mixed functions? double angles?",
      "Use identities to rewrite everything in terms of **one** trig function.",
      "Solve the resulting algebraic equation (often a quadratic in $\\sin$ or $\\cos$).",
      "Find all solutions in the required interval using the CAST diagram or the graphs.",
      "Check that no solution is lost by dividing by a trig function that could be zero.",
    ],
    examTips: ["When proving identities, work on **one side only** and transform it into the other.", "Give answers in the unit the question uses (degrees or radians)."],
    mistakes: ["Dividing both sides by $\\cos\\theta$ and losing the solutions where $\\cos\\theta = 0$.", "Only giving the principal value instead of all solutions in the range."],
    cards: [
      ["Pythagorean identity?", "$\\sin^2\\theta + \\cos^2\\theta = 1$"],
      ["$\\sin 2A$?", "$2\\sin A\\cos A$"],
      ["Three forms of $\\cos 2A$?", "$\\cos^2 A - \\sin^2 A$, $2\\cos^2 A - 1$, $1 - 2\\sin^2 A$"],
      ["$1 + \\tan^2\\theta$?", "$\\sec^2\\theta$"],
      ["π radians in degrees?", "180°"],
    ],
    check: "Solve $2\\sin^2 x = 1$ for $0 \\le x \\le 2\\pi$.",
  },

  // ───────────────────────── BIOLOGY ─────────────────────────
  {
    id: "photosynthesis",
    subject: "Biology",
    title: "Photosynthesis",
    keywords: ["photosynthesis", "chlorophyll", "chloroplast", "light dependent", "light independent", "calvin cycle", "limiting factor"],
    oneLiner: "Plants turn light energy into chemical energy stored in glucose.",
    beginner: md`A leaf is a tiny **solar-powered food factory**.
- **Inputs**: carbon dioxide from the air, water from the roots, and sunlight.
- **Machinery**: chloroplasts, which contain green chlorophyll.
- **Outputs**: glucose (food) and oxygen (released into the air).

Almost every living thing ultimately relies on this process for food.`,
    core: md`**Overall equation**
$$6\text{CO}_2 + 6\text{H}_2\text{O} \xrightarrow{\text{light, chlorophyll}} \text{C}_6\text{H}_{12}\text{O}_6 + 6\text{O}_2$$

**Two stages** (in the chloroplast)
1. **Light-dependent reactions** (thylakoid membranes): light is absorbed by chlorophyll, water is split (**photolysis**) releasing O₂, and **ATP** and **reduced NADP** are made.
2. **Light-independent reactions / Calvin cycle** (stroma): CO₂ is fixed by the enzyme **RuBisCO** and then reduced to sugar using ATP and reduced NADP.

**Limiting factors**: light intensity, CO₂ concentration and temperature. The rate is limited by whichever factor is in shortest supply.`,
    advanced: md`### Going deeper
- **Calvin cycle**: CO₂ + RuBP (5C) → 2 × GP (3C), catalysed by RuBisCO. GP is reduced to TP using ATP and reduced NADP. Most TP regenerates RuBP, and some is used to make glucose, amino acids and lipids.
- **Photophosphorylation**: electrons excited in photosystem II pass along an electron transport chain, pumping protons into the thylakoid space. ATP synthase then uses the proton gradient (**chemiosmosis**).
- Oxygen comes from **water**, not CO₂. This was shown using the ¹⁸O isotope.`,
    steps: [
      "Light is absorbed by chlorophyll in the thylakoid membranes.",
      "Water is split by photolysis, releasing oxygen, protons and electrons.",
      "The energy from excited electrons is used to make ATP and reduced NADP.",
      "In the stroma, CO₂ combines with RuBP (catalysed by RuBisCO) to form GP.",
      "GP is reduced to TP using ATP and reduced NADP, and TP makes glucose and regenerates RuBP.",
    ],
    examTips: ["Name the **locations** (thylakoid vs stroma). They're frequent marking points.", "For limiting-factor graphs, identify the factor limiting the *plateau*, not the rising section."],
    mistakes: ["Saying the O₂ produced comes from CO₂ (it comes from water).", "Saying plants don't respire (they do, all the time)."],
    cards: [
      ["Word equation for photosynthesis?", "Carbon dioxide + water → glucose + oxygen (in light, with chlorophyll)"],
      ["Where do the light-dependent reactions happen?", "Thylakoid membranes of the chloroplast."],
      ["Enzyme that fixes CO₂?", "RuBisCO"],
      ["Source of the oxygen released?", "Water (photolysis)."],
      ["Three limiting factors?", "Light intensity, CO₂ concentration, temperature."],
    ],
    check: "Why does the rate of photosynthesis level off at high light intensity?",
  },
  {
    id: "respiration",
    subject: "Biology",
    title: "Cellular Respiration",
    keywords: ["respiration", "aerobic", "anaerobic", "glycolysis", "krebs", "atp", "mitochondria", "fermentation", "oxidative phosphorylation"],
    oneLiner: "Cells break down glucose to release energy as ATP.",
    beginner: md`Food is like fuel in a tank, but your cells can't use it directly. **Respiration** is the process that "burns" glucose in a controlled way inside cells to make **ATP**, a small energy packet that powers everything from muscle movement to thinking.

- **With oxygen (aerobic)**: lots of ATP.
- **Without oxygen (anaerobic)**: a little ATP, fast, and it produces lactate in muscles (or ethanol in yeast).`,
    core: md`**Aerobic respiration**
$$\text{C}_6\text{H}_{12}\text{O}_6 + 6\text{O}_2 \to 6\text{CO}_2 + 6\text{H}_2\text{O} + \text{ATP}$$

**Stages**
| Stage | Location | Key output |
|---|---|---|
| Glycolysis | Cytoplasm | 2 pyruvate, net 2 ATP, reduced NAD |
| Link reaction | Mitochondrial matrix | Acetyl CoA, CO₂ |
| Krebs cycle | Mitochondrial matrix | CO₂, reduced NAD/FAD, ATP |
| Oxidative phosphorylation | Inner mitochondrial membrane (cristae) | Most of the ATP; O₂ is the final electron acceptor → H₂O |

**Anaerobic respiration**
- Animals: glucose → **lactate** (regenerates NAD so glycolysis can continue)
- Yeast/plants: glucose → **ethanol + CO₂**

Aerobic respiration yields ~30–32 ATP per glucose; anaerobic yields only 2.`,
    advanced: md`### Going deeper
- **Chemiosmosis**: the electron transport chain pumps H⁺ into the intermembrane space, and H⁺ flowing back through ATP synthase drives ATP formation.
- Without O₂ to accept electrons, the chain stops, NAD isn't regenerated, and only glycolysis can continue (via lactate or ethanol pathways).
- **Respiratory quotient** RQ = CO₂ produced / O₂ consumed. It's about 1.0 for carbohydrates and about 0.7 for lipids.`,
    steps: [
      "Glycolysis in the cytoplasm splits glucose into 2 pyruvate, giving a small ATP yield.",
      "Pyruvate enters the mitochondrion and is converted to acetyl CoA (link reaction), releasing CO₂.",
      "The Krebs cycle oxidises acetyl groups, releasing CO₂ and producing reduced NAD and FAD.",
      "Reduced NAD and FAD donate electrons to the electron transport chain.",
      "The proton gradient drives ATP synthase, and oxygen accepts the electrons to form water.",
    ],
    examTips: ["Link each stage to its **location**. It's the easiest mark to secure.", "Explain *why* anaerobic respiration happens: to regenerate NAD for glycolysis."],
    mistakes: ["Saying respiration 'produces energy' (energy is released or transferred, not produced).", "Confusing respiration with breathing."],
    cards: [
      ["Where does glycolysis occur?", "In the cytoplasm."],
      ["Final electron acceptor in aerobic respiration?", "Oxygen."],
      ["Product of anaerobic respiration in muscles?", "Lactate."],
      ["Where is most ATP made?", "Inner mitochondrial membrane (oxidative phosphorylation)."],
      ["Net ATP from glycolysis?", "2"],
    ],
    check: "Why does anaerobic respiration produce so much less ATP than aerobic respiration?",
  },
  {
    id: "cell-structure",
    subject: "Biology",
    title: "Cell Structure",
    keywords: ["cell structure", "organelle", "nucleus", "mitochondria", "ribosome", "eukaryotic", "prokaryotic", "cell membrane", "plant cell", "animal cell", "cell wall"],
    oneLiner: "Cells are the basic units of life, with organelles that divide up the work.",
    beginner: md`A cell is like a **tiny city**:
- **Nucleus**: city hall, storing the instructions (DNA)
- **Mitochondria**: power stations, releasing energy
- **Ribosomes**: factories, building proteins
- **Cell membrane**: border control, deciding what gets in and out

Plant cells also have a **cell wall** (strong outer fence), **chloroplasts** (solar panels) and a large **vacuole** (water tank).`,
    core: md`**Eukaryotic organelles**
| Organelle | Function |
|---|---|
| Nucleus | Contains DNA; controls cell activity |
| Mitochondrion | Site of aerobic respiration (ATP) |
| Ribosome (80S) | Protein synthesis |
| Rough ER | Makes and transports proteins |
| Smooth ER | Makes lipids |
| Golgi apparatus | Modifies and packages proteins |
| Lysosome | Contains digestive enzymes |
| Cell membrane | Controls entry and exit (partially permeable) |

**Plant cells also have**: a cellulose cell wall, chloroplasts and a large permanent vacuole.

**Prokaryotes** (bacteria) have **no nucleus** (DNA is free in the cytoplasm), smaller **70S ribosomes**, a cell wall made of murein, and often plasmids.`,
    advanced: md`### Going deeper
- **Endosymbiotic theory**: mitochondria and chloroplasts have their own circular DNA and 70S ribosomes, which suggests they were once free-living prokaryotes.
- **Fluid mosaic model**: a phospholipid bilayer with proteins floating in it. Cholesterol regulates fluidity, and glycoproteins act in cell recognition.
- **Protein secretion pathway**: ribosome on the RER → vesicle → Golgi → secretory vesicle → exocytosis.`,
    steps: [
      "Decide whether the cell is prokaryotic or eukaryotic: is there a nucleus?",
      "If eukaryotic, check for a cell wall, chloroplasts and a large vacuole to tell plant from animal.",
      "Identify each organelle from its shape (e.g. mitochondria have cristae, chloroplasts have thylakoid stacks).",
      "Link each organelle to its function.",
      "For secreted proteins, trace the path RER → Golgi → vesicle → membrane.",
    ],
    examTips: ["Ribosome size (70S vs 80S) is a favourite prokaryote/eukaryote comparison point.", "Use precise names ('rough endoplasmic reticulum', not just 'ER')."],
    mistakes: ["Saying plant cells have no mitochondria (they do).", "Calling the cell wall 'partially permeable' (it's fully permeable)."],
    cards: [
      ["Function of ribosomes?", "Protein synthesis."],
      ["Main difference between prokaryotes and eukaryotes?", "Prokaryotes have no membrane-bound nucleus."],
      ["Function of the Golgi apparatus?", "Modifies, packages and transports proteins."],
      ["Ribosome size in prokaryotes?", "70S"],
      ["Evidence for endosymbiotic theory?", "Mitochondria and chloroplasts have their own circular DNA and 70S ribosomes."],
    ],
    check: "Name three structures found in plant cells but not in animal cells.",
  },
  {
    id: "dna",
    subject: "Biology",
    title: "DNA Structure & Replication",
    keywords: ["dna", "replication", "double helix", "base pair", "nucleotide", "semi-conservative", "gene", "helicase", "polymerase"],
    oneLiner: "DNA stores genetic information in a double helix and copies itself semi-conservatively.",
    beginner: md`DNA is like a **twisted ladder**. The rungs are made of paired "letters":
- **A** always pairs with **T**,
- **C** always pairs with **G**.

To copy itself, the ladder **unzips down the middle**, and each half builds a new partner using those pairing rules. You end up with two identical ladders, each half old and half new.`,
    core: md`**Structure**
- A polymer of **nucleotides**: deoxyribose sugar + phosphate + nitrogenous base
- Two **antiparallel** strands (5′→3′ and 3′→5′) twisted into a **double helix**
- Complementary base pairing via **hydrogen bonds**: A–T (2 H-bonds), C–G (3 H-bonds)
- Sugar–phosphate backbone joined by **phosphodiester bonds**

**Semi-conservative replication**
1. **DNA helicase** breaks the hydrogen bonds and unwinds the helix.
2. Each strand acts as a **template**.
3. Free nucleotides pair with their complementary bases.
4. **DNA polymerase** joins the nucleotides (5′→3′), forming phosphodiester bonds.
5. Each new molecule has one original strand and one new strand.`,
    advanced: md`### Going deeper
- **Meselson–Stahl experiment** (¹⁵N/¹⁴N density centrifugation) confirmed semi-conservative replication: after one generation the DNA was all intermediate density.
- DNA polymerase only adds to the **3′ end**, so the lagging strand is made in **Okazaki fragments** that are joined by **DNA ligase**.
- G–C rich DNA is more thermally stable because each G–C pair has 3 hydrogen bonds.`,
    steps: [
      "DNA helicase unwinds the double helix by breaking the hydrogen bonds between bases.",
      "Both separated strands act as templates.",
      "Free DNA nucleotides line up by complementary base pairing (A–T, C–G).",
      "DNA polymerase joins adjacent nucleotides with phosphodiester bonds.",
      "Two identical DNA molecules form, each with one original and one new strand.",
    ],
    examTips: ["Name **both** enzymes and say exactly what each does.", "'Semi-conservative' must be explained: each new molecule keeps one original strand."],
    mistakes: ["Saying DNA polymerase forms the hydrogen bonds (they form spontaneously).", "Mixing up DNA and RNA bases (U only occurs in RNA)."],
    cards: [
      ["Complementary base pairs in DNA?", "A–T and C–G"],
      ["Role of DNA helicase?", "Breaks hydrogen bonds to unwind and separate the strands."],
      ["Role of DNA polymerase?", "Joins nucleotides by forming phosphodiester bonds."],
      ["What does semi-conservative mean?", "Each new DNA molecule contains one original strand and one new strand."],
      ["Which experiment proved it?", "Meselson and Stahl (¹⁵N/¹⁴N)."],
    ],
    check: "If a DNA sample is 20% adenine, what percentage is guanine?",
  },

  // ───────────────────────── GENERAL / STUDY SKILLS ─────────────────────────
  {
    id: "study-techniques",
    subject: "General",
    title: "Evidence-Based Study Techniques",
    keywords: ["study technique", "how to study", "active recall", "spaced repetition", "pomodoro", "memorise", "memorize", "revision technique", "focus", "procrastination", "study tips", "study better"],
    oneLiner: "Study smarter by retrieving and spacing, not re-reading and highlighting.",
    beginner: md`Re-reading your notes *feels* productive, but your brain is mostly just recognising things.

What actually works:
- **Test yourself** (active recall): close the book and try to remember.
- **Spread it out** (spaced repetition): review after 1 day, then 3 days, then a week.
- **Work in focused blocks** (Pomodoro): 25–50 minutes on, a short break, phone out of reach.`,
    core: md`### 1. Active recall
Retrieving information strengthens memory far more than re-reading it. Use flashcards, blank-page recall and past papers.

### 2. Spaced repetition
Review just before you would forget. A simple schedule is **Day 1 → Day 3 → Day 7 → Day 14 → Day 30**.

### 3. Interleaving
Mix different problem types in one session (e.g. differentiation, integration and trig together). It feels harder, but it builds the skill of *choosing the right method*.

### 4. Deep work blocks
Work in **50/10** or **25/5** focus/break cycles. Single-task, and keep notifications off.

### 5. Elaboration and teaching
Explain the concept in your own words as if teaching a friend (the *Feynman technique*). The gaps in your explanation are the gaps in your knowledge.`,
    advanced: md`### Going deeper
- **The testing effect** and **the spacing effect** are among the most replicated findings in learning science.
- **Desirable difficulties**: conditions that make learning feel harder (retrieval, spacing, interleaving) often produce stronger long-term retention.
- Track your **error log**: every mistake from past papers goes into a list you revisit. It's the highest-yield revision document you can make.`,
    steps: [
      "Pick one topic and study it for 25–50 focused minutes.",
      "Close your notes and write down everything you remember (active recall).",
      "Check against your notes and fill the gaps in a different colour.",
      "Turn the gaps into flashcards.",
      "Schedule reviews at 1, 3, 7 and 14 days (spaced repetition).",
    ],
    examTips: ["In the final 2 weeks, shift most of your time to **timed past papers**.", "Keep a mistakes log and review it the night before the exam."],
    mistakes: ["Highlighting and re-reading as the main strategy.", "Cramming everything into the last few days."],
    cards: [
      ["What is active recall?", "Actively retrieving information from memory, e.g. by self-testing."],
      ["What is spaced repetition?", "Reviewing material at increasing intervals over time."],
      ["What is interleaving?", "Mixing different topics or problem types in one study session."],
      ["The Feynman technique?", "Explain a concept simply, as if teaching someone, to find the gaps in your understanding."],
    ],
    check: "Which feels easier but works worse: re-reading or self-testing?",
  },
];

/** Default syllabus outlines used by the study planner when the student doesn't list topics. */
export const SYLLABUS: Record<Subject, string[]> = {
  Physics: [
    "Kinematics & SUVAT",
    "Newton's laws & momentum",
    "Work, energy & power",
    "Circular motion & gravitation",
    "Oscillations & waves",
    "Thermal physics",
    "Current electricity",
    "Electric & magnetic fields",
    "Modern physics",
  ],
  Chemistry: [
    "Atomic structure",
    "Bonding & structure",
    "Mole concept & stoichiometry",
    "Energetics",
    "Reaction rates",
    "Chemical equilibrium",
    "Acids, bases & pH",
    "Organic basics & nomenclature",
    "Organic reactions & mechanisms",
  ],
  "Combined Mathematics": [
    "Algebra & quadratics",
    "Functions & graphs",
    "Trigonometry",
    "Differentiation",
    "Integration",
    "Vectors",
    "Statics",
    "Dynamics",
    "Probability & statistics",
  ],
  Biology: [
    "Cell structure",
    "Biological molecules",
    "DNA & genetics",
    "Photosynthesis",
    "Respiration",
    "Human physiology",
    "Plant physiology",
    "Ecology",
    "Evolution",
  ],
  General: ["Core concepts", "Key definitions", "Worked examples", "Problem practice", "Weak areas", "Past papers"],
};

const reCache = new Map<string, RegExp>();
/** Whole-word match (so "ph" doesn't match "graph"), allowing simple plurals. */
function keywordRe(k: string): RegExp {
  let re = reCache.get(k);
  if (!re) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(^|[^a-z])${escaped}(s|es)?(?=[^a-z]|$)`);
    reCache.set(k, re);
  }
  return re;
}

/** Find the best-matching topic for a message (longest keyword match wins). */
export function findTopic(text: string, preferSubject?: Subject): Topic | undefined {
  const t = " " + text.toLowerCase().replace(/[’']/g, "'") + " ";
  let best: { topic: Topic; score: number } | undefined;
  for (const topic of TOPICS) {
    for (const k of topic.keywords) {
      if (keywordRe(k).test(t)) {
        let score = k.length;
        if (preferSubject && topic.subject === preferSubject) score += 2;
        if (!best || score > best.score) best = { topic, score };
      }
    }
    // title match counts strongly
    if (t.includes(topic.title.toLowerCase())) {
      const score = topic.title.length + 5;
      if (!best || score > best.score) best = { topic, score };
    }
  }
  return best?.topic;
}

export function topicsFor(subject: Subject): Topic[] {
  return TOPICS.filter((t) => t.subject === subject);
}
