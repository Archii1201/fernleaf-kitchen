# Step 19 — Dashboards

Canonical metric definitions live in the root README. Endpoints:

- `GET /dashboard/admin` — `reports.view`
- `GET /dashboard/kitchen` — `kitchen.view`
- `GET /dashboard/dispatch` — `dispatch.view`
- `GET /dashboard/driver` — `driver.view`

Calculations stay in `DashboardService` (aggregates + existing CutoffService / kitchen board).
