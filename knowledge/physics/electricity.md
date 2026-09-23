---
title: Current Electricity & Ohm's Law
subject: Physics
source: OLIS core notes
---

# Current Electricity & Ohm's Law

How charge flows through circuits, and how voltage, current and resistance are linked.

## Intuition

Think of a circuit as water pipes:
- **Voltage (V)** is the *push*, like water pressure from a pump.
- **Current (I)** is *how much flows* per second.
- **Resistance (R)** is how *narrow* the pipe is.

Push harder and more flows; narrow the pipe and less flows. That's **Ohm's law**: $V = IR$.

## Core explanation

**Current**: rate of flow of charge, $I = \dfrac{Q}{t}$ (amperes, A).

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

**Power**: $P = VI = I^2R = \dfrac{V^2}{R}$

## Going deeper
- **Kirchhoff's 1st law** (junction rule): the total current into a junction equals the total current out, which follows from conservation of charge.
- **Kirchhoff's 2nd law** (loop rule): the sum of EMFs around a loop equals the sum of the potential drops ($\sum \varepsilon = \sum IR$), which follows from conservation of energy.
- Real cells have **internal resistance** $r$: $\varepsilon = I(R + r)$, so the terminal p.d. $V = \varepsilon - Ir$ drops as the current increases.

## Method, step by step

1. Simplify the circuit: combine series and parallel resistors step by step into one total resistance.
2. Find the total current from the supply: $I = V_{\text{total}} / R_{\text{total}}$.
3. Work back out through the circuit: the current is the same in series parts and splits in parallel parts.
4. Use $V = IR$ on each component to find the p.d. across it.
5. Check: the p.d.s around any loop should add up to the supply EMF.

## Exam tips

- Adding a resistor in **parallel** always *decreases* the total resistance.
- Ohm's law only applies to ohmic conductors at constant temperature. Say this in 'state' questions.

## Common mistakes

- Adding parallel resistances directly instead of adding their reciprocals.
- Forgetting to flip the final reciprocal: $1/R = 0.5$ means $R = 2\ \Omega$.

## Key facts

- **State Ohm's law.** For a conductor at constant temperature, current is directly proportional to the p.d. across it.
- **Total resistance of 4 Ω and 4 Ω in parallel?** 2 Ω
- **Three formulas for electrical power?** $P = VI = I^2R = V^2/R$
- **Resistance of a wire formula?** $R = \rho L / A$
- **Kirchhoff's first law is based on conservation of…?** Charge.
