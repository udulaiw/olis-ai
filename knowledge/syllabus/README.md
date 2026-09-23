# Syllabus documents

Put the text of the **official** Sri Lankan G.C.E. A/L syllabus documents here
(NIE / Department of Examinations), one unit per file, under a subject folder:

```
knowledge/syllabus/physics/unit-04-electricity.md
```

Frontmatter:

```markdown
---
title: Physics · Unit 4 · Current electricity (official syllabus)
type: syllabus
subject: Physics
unit: electricity
source: NIE G.C.E. A/L Physics syllabus (<year of issue>)
url: <link to the official PDF>
verified: true
---
```

Then, in `server/knowledge/taxonomy.ts`, set that unit's `officialRef` and
`verified: true`. Until a unit is verified, OLIS treats its topic map as
provisional and won't state syllabus facts it hasn't been given.

This folder is intentionally empty: OLIS does not ship syllabus content it
hasn't been able to check against the official documents.
