# CMADD2 private business analysis

This module is on `feature/customer-email-auth` and is not live until the branch is tested, merged and deployed.

- Admin-only business dashboard: `admin-business.html`
- Manual daily/monthly sales targets and sale entries; amounts are internal and never displayed as public product rates.
- Progress thresholds: below 15% red, 15% to below 50% orange, 50% and above green. If a target is not set, the UI displays 0% and "Target not set".
- Medical Representatives can be added manually. A sale assigned to a matching active MR awards 2 points. Every 100 points advances one level (Starter, Bronze, Silver, Gold, Platinum, Diamond, Elite).
- Admin-created products are stored in SQLite and appended to the public product catalog, with no price field.
- Customer account shows a CMADD internal payment score derived from recorded debit (billed) and credit (payment) entries, capped at 300–900. It is not a CIBIL score or lender decision. Due-date/on-time scoring is not possible because ledger entries currently have no due dates.
- Tables are created automatically in `complaints.db`; Render needs persistent storage to retain them.

Before production: run syntax checks and regression tests against a backup/staging database. Confirm that the Render disk is persistent and configured before merging/deploying.
