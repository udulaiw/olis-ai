---
title: Number Systems and Logic Gates
subject: ICT
level: OL
grade: 10
topic: Data representation
source: OLIS core notes
verified: false
---

# Number Systems and Logic Gates

How computers represent numbers, and the basic gates that process them.

## Number systems

| System | Base | Digits used |
|---|---|---|
| Binary | 2 | 0, 1 |
| Octal | 8 | 0–7 |
| Decimal | 10 | 0–9 |
| Hexadecimal | 16 | 0–9, A–F (A = 10 … F = 15) |

**Place values**: each place is worth the base raised to a power. In binary, from the right: $2^0 = 1$, $2^1 = 2$, $2^2 = 4$, $2^3 = 8$ …

## Converting between bases

**Binary → decimal**: add the place values of the 1s.
$$1011_2 = 8 + 0 + 2 + 1 = 11_{10}$$

**Decimal → binary**: divide by 2 repeatedly and read the remainders from bottom to top.
$$13_{10} = 1101_2$$

**Binary → hexadecimal**: group bits in fours from the right; each group is one hex digit.
$$1010\,1111_2 = AF_{16}$$

**Binary → octal**: group bits in threes from the right.
$$110\,101_2 = 65_8$$

## Units of data

- 1 bit = one binary digit (0 or 1)
- 1 nibble = 4 bits
- 1 byte = 8 bits
- 1 KB = 1024 bytes, 1 MB = 1024 KB, 1 GB = 1024 MB (as used in the O/L ICT syllabus)

## Logic gates

| A | B | A AND B | A OR B | NOT A |
|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 1 |
| 0 | 1 | 0 | 1 | 1 |
| 1 | 0 | 0 | 1 | 0 |
| 1 | 1 | 1 | 1 | 0 |

- **AND**: output 1 only when all inputs are 1.
- **OR**: output 1 when at least one input is 1.
- **NOT**: one input; the output is the opposite.
- **NAND** = NOT AND, **NOR** = NOT OR.

## Exam tips

- Always write the base as a subscript ($1101_2$) so the examiner sees which system you mean.
- Check a decimal → binary answer by converting it back.
