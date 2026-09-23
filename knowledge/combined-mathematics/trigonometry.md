---
title: Trigonometric Identities
subject: Combined Mathematics
source: OLIS core notes
---

# Trigonometric Identities

Relationships between sin, cos and tan that are true for every angle.

## Intuition

Take a right-angled triangle:
- $\sin\theta = \dfrac{\text{opposite}}{\text{hypotenuse}}$, $\cos\theta = \dfrac{\text{adjacent}}{\text{hypotenuse}}$, $\tan\theta = \dfrac{\text{opposite}}{\text{adjacent}}$

An **identity** is a rule that works for *every* angle, not just one. The most famous comes straight from Pythagoras: $\sin^2\theta + \cos^2\theta = 1$.

## Core explanation

**Fundamental identities**
$$\tan\theta = \frac{\sin\theta}{\cos\theta}, \qquad \sin^2\theta + \cos^2\theta = 1$$
$$1 + \tan^2\theta = \sec^2\theta, \qquad 1 + \cot^2\theta = \csc^2\theta$$

**Compound angles**
$$\sin(A \pm B) = \sin A\cos B \pm \cos A\sin B$$
$$\cos(A \pm B) = \cos A\cos B \mp \sin A\sin B$$

**Double angles**
$$\sin 2A = 2\sin A\cos A$$
$$\cos 2A = \cos^2 A - \sin^2 A = 2\cos^2 A - 1 = 1 - 2\sin^2 A$$

**Radians**: $\pi\ \text{rad} = 180^\circ$

## Going deeper
- **R-formula**: $a\sin\theta + b\cos\theta = R\sin(\theta + \alpha)$, where $R = \sqrt{a^2 + b^2}$ and $\tan\alpha = b/a$. Use it for max/min problems and for solving equations.
- **General solutions**: $\sin\theta = \sin\alpha \Rightarrow \theta = n\pi + (-1)^n\alpha$; $\cos\theta = \cos\alpha \Rightarrow \theta = 2n\pi \pm \alpha$; $\tan\theta = \tan\alpha \Rightarrow \theta = n\pi + \alpha$.
- Pick the form of $\cos 2A$ that matches the rest of the equation, so everything ends up in terms of *one* function.

## Method, step by step

1. Look at what's in the equation: mixed functions? double angles?
2. Use identities to rewrite everything in terms of **one** trig function.
3. Solve the resulting algebraic equation (often a quadratic in $\sin$ or $\cos$).
4. Find all solutions in the required interval using the CAST diagram or the graphs.
5. Check that no solution is lost by dividing by a trig function that could be zero.

## Exam tips

- When proving identities, work on **one side only** and transform it into the other.
- Give answers in the unit the question uses (degrees or radians).

## Common mistakes

- Dividing both sides by $\cos\theta$ and losing the solutions where $\cos\theta = 0$.
- Only giving the principal value instead of all solutions in the range.

## Key facts

- **Pythagorean identity?** $\sin^2\theta + \cos^2\theta = 1$
- **$\sin 2A$?** $2\sin A\cos A$
- **Three forms of $\cos 2A$?** $\cos^2 A - \sin^2 A$, $2\cos^2 A - 1$, $1 - 2\sin^2 A$
- **$1 + \tan^2\theta$?** $\sec^2\theta$
- **π radians in degrees?** 180°
