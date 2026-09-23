---
title: Integration
subject: Combined Mathematics
source: OLIS core notes
---

# Integration

Integration reverses differentiation and finds areas under curves.

## Intuition

If differentiation asks "how fast is it changing?", integration asks "**how much has built up in total?**"

If you know your speed at every moment, integration adds up all those tiny bits of distance to give the **total distance**. On a graph, that total is the **area under the curve**.

## Core explanation

**Power rule** (reverse of differentiation):
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

**Example:** $\displaystyle\int_0^2 3x^2\,dx = \big[x^3\big]_0^2 = 8 - 0 = 8$

## Going deeper
- **Substitution**: choose $u = g(x)$ so the integral becomes simpler. Change the limits too for definite integrals.
- **By parts**: $\int u\,\dfrac{dv}{dx}\,dx = uv - \int v\,\dfrac{du}{dx}\,dx$. Choose $u$ to be something that gets simpler when differentiated (LIATE is a helpful guide).
- Area **below** the x-axis comes out negative. Split the integral at the roots and take absolute values for the total area.

## Method, step by step

1. Rewrite each term in index form.
2. Increase each power by 1 and divide by the new power.
3. For an indefinite integral, add $+C$.
4. For a definite integral, substitute the upper limit, then the lower, and subtract.
5. For areas, check whether the curve dips below the x-axis within the limits.

## Exam tips

- Never forget $+C$ on indefinite integrals. It's a common lost mark.
- Show the square-bracket step $[F(x)]_a^b$ before substituting.

## Common mistakes

- Using the power rule for $x^{-1}$ (it gives division by zero; use $\ln|x|$).
- Subtracting in the wrong order: it's upper minus lower.

## Key facts

- **$\int x^n\,dx$?** $\frac{x^{n+1}}{n+1} + C$, for $n \neq -1$
- **$\int \frac{1}{x}\,dx$?** $\ln|x| + C$
- **$\int \cos x\,dx$?** $\sin x + C$
- **Integration by parts formula?** $\int u\,v'\,dx = uv - \int v\,u'\,dx$
- **Why split an area integral at the roots?** Area below the x-axis is negative and would cancel positive area.
