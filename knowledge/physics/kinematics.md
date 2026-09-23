---
title: Kinematics & the SUVAT Equations
subject: Physics
source: OLIS core notes
---

# Kinematics & the SUVAT Equations

Describing motion with five quantities: s, u, v, a and t.

## Intuition

Imagine a bike ride. At any moment you can ask:
- how far you've gone (**displacement, s**),
- how fast you started (**initial velocity, u**),
- how fast you're going now (**final velocity, v**),
- how quickly your speed is changing (**acceleration, a**),
- how long it's been (**time, t**).

If the acceleration stays **constant**, knowing any **three** of these lets you work out the other two. That's the whole trick of SUVAT.

## Core explanation

For motion in a straight line with **constant acceleration**:

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
$v = 0 + 2(5) = 10\ \text{m s}^{-1}$, and $s = \tfrac12(2)(5^2) = 25\ \text{m}$.

## Going deeper
- The SUVAT equations come from integrating constant acceleration: $v = \int a\,dt = u + at$, then $s = \int v\,dt = ut + \tfrac12 at^2$.
- If the acceleration **isn't constant**, SUVAT doesn't apply. Use calculus instead: $v = \dfrac{ds}{dt}$ and $a = \dfrac{dv}{dt} = v\dfrac{dv}{ds}$.
- Vertical free-fall is the SUVAT case with $a = -g$ (taking up as positive). Choose a sign convention and stick to it.

## Method, step by step

1. List the five SUVAT variables and fill in the three you know (watch for hidden info: *from rest* means $u = 0$).
2. Circle the variable you need to find.
3. Identify the variable you neither know nor need, and pick the equation that leaves it out.
4. Substitute with a consistent sign convention (e.g. up/right positive).
5. Solve, then check the units and whether the answer makes sense.

## Exam tips

- Write down your list of s, u, v, a, t first. Examiners often give method marks for it.
- 'Dropped' or 'from rest' means $u = 0$; 'comes to rest' means $v = 0$.
- For quadratics in $t$, reject negative times unless the physics allows them.

## Common mistakes

- Using SUVAT when the acceleration is changing.
- Mixing up signs for a ball thrown upwards (g should be negative if up is positive).

## Key facts

- **Which SUVAT equation has no $s$?** $v = u + at$
- **Which SUVAT equation has no $t$?** $v^2 = u^2 + 2as$
- **What does the area under a v–t graph represent?** Displacement.
- **What does the gradient of a v–t graph represent?** Acceleration.
- **Condition for SUVAT to be valid?** Constant (uniform) acceleration in a straight line.
