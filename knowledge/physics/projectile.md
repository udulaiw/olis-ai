---
title: Projectile Motion
subject: Physics
source: OLIS core notes
---

# Projectile Motion

Horizontal and vertical motion happen independently. Treat them separately.

## Intuition

Throw a ball forward. Two things happen **at the same time, independently**:
- sideways, it keeps moving at a **steady speed** (nothing pushes it sideways, ignoring air),
- up and down, it **falls** just like a dropped ball, pulled by gravity.

Combine the two and you get the curved path, a **parabola**.

## Core explanation

Resolve the launch velocity $u$ at angle $\theta$:
$$u_x = u\cos\theta, \qquad u_y = u\sin\theta$$

**Horizontal** (no acceleration, ignoring air resistance): $x = u_x t$

**Vertical** (constant acceleration $-g$): use SUVAT with $a = -g$.

**Useful results** (launch and landing at the same height):
- Time of flight: $T = \dfrac{2u\sin\theta}{g}$
- Maximum height: $H = \dfrac{u^2\sin^2\theta}{2g}$
- Range: $R = \dfrac{u^2\sin 2\theta}{g}$, which is maximum at $\theta = 45^\circ$

**Key link:** **time** is the only quantity shared by both directions.

## Going deeper
- Eliminating $t$ gives the trajectory $y = x\tan\theta - \dfrac{g x^2}{2u^2\cos^2\theta}$, which is a parabola.
- Complementary angles (e.g. 30° and 60°) give the same range on level ground.
- With air resistance the path isn't a parabola: the range drops and the optimum angle falls below 45°.

## Method, step by step

1. Resolve the initial velocity into horizontal and vertical components.
2. Vertical: use SUVAT with $a = -g$ to find the time (e.g. time to land or to reach the top).
3. Horizontal: use distance = $u_x \times t$ with that same time.
4. At the highest point, the vertical velocity is zero, but the horizontal velocity is unchanged.
5. Combine components with Pythagoras if you need the final speed.

## Exam tips

- At maximum height $v_y = 0$, which is often the key equation.
- Use the same time in both directions. It's the bridge between them.

## Common mistakes

- Using $u$ instead of its components in SUVAT.
- Thinking the velocity is zero at the top. Only the vertical component is.

## Key facts

- **Horizontal acceleration of a projectile (no air resistance)?** Zero.
- **Range formula on level ground?** $R = u^2\sin 2\theta / g$
- **Angle for maximum range?** 45°
- **What's the vertical velocity at maximum height?** Zero.
