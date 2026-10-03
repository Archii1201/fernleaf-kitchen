# Step 13 — Cutoff processing

Canonical write-up: `docs/explanation/step13.md`.

`ensureProcessed(date)` is the single application entry. Controllers and the
scheduler do not write to Prisma themselves. Advisory lock + CutoffRun make
repeats safe.
