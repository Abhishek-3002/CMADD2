# CMADD2 production safety and deployment checklist

## Current branch changes

This branch adds production startup guards and moves the SQLite database to an explicitly configured data directory in production. It also stores Express sessions in a SQLite table, uses a dedicated session-cookie name, and sets an eight-hour cookie lifetime.

**This is not a production deployment.** Do not merge or deploy until the steps below are completed and the owner approves.

## Render configuration (must be checked manually)

1. In the Render dashboard, confirm whether the existing service has a persistent disk and note its exact mount path.
2. Set `CMADD2_DATA_DIR` to that exact mount path (for example, `/var/data` only if that is the actual configured mount path).
3. Confirm the existing `complaints.db` and any SQLite sidecar files are backed up and safely copied/migrated to the persistent directory before switching database paths. Do not start a new database at an empty path and assume it contains existing customer records.
4. Set `NODE_ENV=production`, `SESSION_SECRET` (random, private, at least 32 bytes), `ADMIN_USERNAME`, and `ADMIN_PASSWORD` in Render's environment settings. Never share secret values in chat or commit them.
5. The server now refuses to start in production if `CMADD2_DATA_DIR` or `SESSION_SECRET` is missing. This guard is intentionally on the feature branch only until reviewed and configured.
6. The server trusts one reverse proxy in production for secure-cookie detection. Confirm Render's deployment topology before changing this value.
7. The custom SQLite session store uses the same persistent SQLite database. It is suitable for a single service instance with a persistent disk; it is not a substitute for a shared store when scaling to multiple instances.

## Backup and validation steps

- Make a consistent SQLite backup using SQLite's backup API or `VACUUM INTO` while connected to the source database; avoid copying only the main file while WAL writes are active.
- Restore the backup into a separate staging directory and verify expected row counts for `complaints`, `feedback`, `enquiries`, `orders`, and customer/business tables.
- Run syntax checks and integration tests on this branch.
- Test session create/read/touch/expire/destroy behavior and verify that an authenticated session survives a server restart in staging.
- Test that customer and admin sessions are isolated, logout invalidates a session, and Secure/HttpOnly/SameSite cookie attributes are correct under HTTPS.
- Regression-test complaint submission/tracking, feedback, product enquiry, order tracking, and admin login against staging.
- Confirm that public product pages do not expose prices.
- Review rate limiting and CSRF protections before public launch; they are still separate follow-up security work unless explicitly added and tested.

## Known constraints

- Render's default filesystem is ephemeral. Only files inside the actual persistent-disk mount path survive restarts/deploys. See https://render.com/docs/disks.
- SQLite WAL mode can create `-wal` and `-shm` sidecar files; keep the database on a persistent local filesystem and back it up consistently.
- A disk-backed SQLite database is intended for a single service instance. Do not scale the service horizontally with this storage design.
- The internal customer payment score is not a CIBIL score or a lender decision.
- No production dashboard settings were inspected by this code change; Render disk presence, mount path, environment values, and live data continuity remain unverified.
