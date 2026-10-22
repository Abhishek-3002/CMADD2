# CMADD2 environment configuration

Set these values in the hosting provider's environment-variable settings. Do not commit real passwords or secrets.

Required for admin login:
- `ADMIN_USERNAME`: choose a private admin username.
- `ADMIN_PASSWORD`: choose a long, unique password (at least 16 characters is recommended).
- `SESSION_SECRET`: generate a cryptographically random secret of at least 32 bytes. Example generation command: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Recommended:
- `NODE_ENV=production`
- `PORT` is normally supplied by Render; the server now reads it automatically.

Important deployment notes:
1. Set all required variables in Render before deploying this branch. Without the three required values, the admin login API intentionally returns HTTP 503.
2. Customer/admin session cookies are HTTP-only and use Secure cookies when `NODE_ENV=production`.
3. The app currently uses Express's default in-memory session store. Sessions are not durable across restarts; configure a production session store before relying on long-lived sessions.
4. The SQLite database is stored at `complaints.db` in the application directory. On Render, configure a persistent disk and place the database there before relying on persistent customer/ledger data. Do not assume a deploy preserves SQLite data otherwise.
5. Customer ledger amounts are stored as integer paise. Debit increases the outstanding balance; credit reduces it.
6. This branch has not been deployed to production. Run regression tests against a backup/staging database before merging.
