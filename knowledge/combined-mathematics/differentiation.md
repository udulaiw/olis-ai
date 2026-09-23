---
title: Differentiation
subject: Combined Mathematics
source: OLIS core notes
---

# Differentiation

Differentiation finds the rate of change, or the gradient of a curve at any point.

## Intuition

On a straight road, the slope is the same everywhere. On a **hilly** road, the steepness keeps changing.

Differentiation is a tool that tells you **exactly how steep the curve is at any single point**. It's also how you find "how fast something is changing right now", like your speed at one instant.

## Core explanation

**Definition**: $\dfrac{dy}{dx} = \displaystyle\lim_{h\to 0}\frac{f(x+h) - f(x)}{h}$

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

**Example:** $y = 3x^4 - 5x^2 + 7 \Rightarrow \dfrac{dy}{dx} = 12x^3 - 10x$

## Going deeper
- **Stationary points**: solve $\dfrac{dy}{dx} = 0$. If $\dfrac{d^2y}{dx^2} > 0$ it's a minimum; if $< 0$ it's a maximum; if $= 0$, test further.
- **Implicit differentiation**: differentiate both sides with respect to $x$, treating $y$ as a function of $x$ (e.g. $\frac{d}{dx}(y^2) = 2y\frac{dy}{dx}$).
- **Connected rates of change** chain several derivatives together, e.g. $\dfrac{dV}{dt} = \dfrac{dV}{dr}\cdot\dfrac{dr}{dt}$.

## Method, step by step

1. Rewrite the function in index form (e.g. $\sqrt{x} = x^{1/2}$, $\frac{1}{x^2} = x^{-2}$).
2. Identify the structure: a sum of terms, a product, a quotient or a composite (function of a function).
3. Apply the matching rule (power, product, quotient or chain).
4. Simplify the result.
5. If needed, substitute an $x$-value to get the gradient at a point, or set it to zero for stationary points.

## Exam tips

- Rewrite roots and fractions as powers **before** differentiating.
- For stationary points, always state both coordinates and their nature.

## Common mistakes

- Forgetting the chain rule's inner derivative, e.g. $\frac{d}{dx}\sin(3x) = 3\cos(3x)$.
- Differentiating a constant to anything other than 0.

## Key facts

- **Power rule?** $\frac{d}{dx}x^n = nx^{n-1}$
- **Derivative of $\ln x$?** $\frac{1}{x}$
- **Product rule?** $(uv)' = u'v + uv'$
- **Second-derivative test for a minimum?** $\frac{d^2y}{dx^2} > 0$
- **Derivative of $\cos x$?** $-\sin x$
