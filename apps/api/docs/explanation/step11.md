# Step 11 — Order Creation Architecture

This file is the assignment-path copy of the Step 11 explanation.
The canonical write-up lives at `docs/explanation/step11.md`.

OrderBuilder orchestrates DeliveryResolver, MenuResolver,
CombinationValidator, OrderPricer, CutoffPolicy and OrderRepository.
It does not reimplement menu, pricing, combination or cutoff rules.

See `docs/explanation/step11.md` for the interview-oriented explanation
of snapshots, prep units, the state machine, `SELECT … FOR UPDATE`,
`order.version`, and the combination line-diff.
