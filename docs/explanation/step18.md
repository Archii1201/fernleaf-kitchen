# Step 18 — Billing

Billable = confirmed-pipeline status and `invoiceId` is null, grouped by
company (`GET /billing/orders`).

`POST /invoices` locks every selected order, re-checks billable, writes
one `Invoice` + `ORDER` lines from `order.totalCents`, applies unused
all-or-nothing credits that fit, never lets `totalCents` go negative.

Void (`POST /invoices/:id/void`) keeps the invoice row, clears
`Order.invoiceId` / `OrderCredit.invoiceId`. Paid invoices are immutable
(`409`). Corrections use `POST /orders/:id/credits` (`amountCents > 0`,
reason required, sum per order ≤ `order.totalCents`).
