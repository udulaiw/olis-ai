---
title: Quadratic Equations
subject: Combined Mathematics
source: OLIS core notes
---

# Quadratic Equations

Equations of the form ax² + bx + c = 0, with up to two solutions.

## Intuition

A quadratic draws a **U-shaped curve** (a parabola). Solving $ax^2 + bx + c = 0$ just means finding **where that U crosses the x-axis**.

It can cross **twice**, **touch once**, or **miss completely**, so a quadratic has 2, 1 or 0 real solutions.

## Core explanation

**Standard form**: $ax^2 + bx + c = 0$, $a \ne 0$

**Three methods**
1. **Factorising**: $x^2 - 5x + 6 = (x-2)(x-3) = 0 \Rightarrow x = 2, 3$
2. **Completing the square**: $x^2 + bx = \left(x + \tfrac b2\right)^2 - \tfrac{b^2}{4}$
3. **Quadratic formula**:
$$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$

**Discriminant** $\Delta = b^2 - 4ac$
- $\Delta > 0$: two distinct real roots
- $\Delta = 0$: one repeated root
- $\Delta < 0$: no real roots

**Sum and product of roots**: $\alpha + \beta = -\dfrac ba$, $\alpha\beta = \dfrac ca$

## Going deeper
- Completing the square gives the vertex form $a(x - h)^2 + k$, so the turning point is $(h, k)$.
- **Symmetric functions of the roots**: $\alpha^2 + \beta^2 = (\alpha + \beta)^2 - 2\alpha\beta$, which is useful for forming new equations whose roots are related to the old ones.
- **Quadratic inequalities**: find the roots, sketch the parabola, and read off the region. Don't divide by a variable of unknown sign.

## Method, step by step

1. Rearrange into $ax^2 + bx + c = 0$ and identify $a$, $b$ and $c$.
2. Compute the discriminant $b^2 - 4ac$ to see how many real roots there are.
3. Try factorising. If it doesn't factorise nicely, use the formula.
4. Substitute carefully into $x = \frac{-b \pm \sqrt{\Delta}}{2a}$, keeping track of signs.
5. Verify by substituting a root back into the original equation.

## Exam tips

- Write down $a$, $b$ and $c$ explicitly before using the formula. It stops sign errors.
- 'Show that it has no real roots' means: show $b^2 - 4ac < 0$.

## Common mistakes

- Losing the minus sign in $-b$ when $b$ is negative.
- Dividing only part of the numerator by $2a$.

## Key facts

- **Quadratic formula?** $x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$
- **Condition for two distinct real roots?** $b^2 - 4ac > 0$
- **Sum of roots?** $-b/a$
- **Product of roots?** $c/a$
