# Luna

Private self-hosted personal finance tracker. React/Vite frontend, Nitro API, SQLite, PHP minor-unit ledger.

## Development

```sh
pnpm install
pnpm dev
```

First run: open `/login` and create the owner. Production setup requires `LUNA_SETUP_TOKEN`; supply that token in owner setup. Set `LUNA_DB_PATH` to a persistent path outside the web root.

## Production operation

Build with `pnpm build`; run the Nitro output with `pnpm start`. Terminate HTTPS at Caddy and proxy to the app on localhost. Run under a dedicated unprivileged OS user; restrict SSH/firewall, database permissions, and access to persistent storage. Prefer private VPN access. Set `NODE_ENV=production`, `LUNA_DB_PATH`, and a strong out-of-band `LUNA_SETUP_TOKEN` for bootstrap. Never expose setup tokens in browser logs.

The database is not encrypted by Luna. Protect the host/volume. Do not put the SQLite file on network/shared-sync storage. Set a restrictive `umask`; exclude `data/` and backup files from Git and web serving.

## Backup and recovery

Run `node scripts/backup.mjs [destination.sqlite]` nightly. It uses SQLite's online backup API and checks integrity. Encrypt completed backups before off-host transfer; store encryption keys separately. Suggested retention: 7 daily, 4 weekly, 3 monthly. Monitor job success and disk usage. A database backup is not protected until its encrypted off-site copy exists.

Monthly restore drill: restore a copy to an isolated instance, run `PRAGMA integrity_check`, sign in, and compare account totals. Before upgrades/migrations, take and verify a backup. Recovery targets depend on backup cadence: initial RPO ≤24 hours, RTO roughly 1–4 hours after a tested restore.

Owner bootstrap utility: `node scripts/setup-owner.mjs`. It creates an owner using Argon2id; protect operator access and avoid shell history containing secrets. Password reset/recovery should be performed offline by the operator, then revoke existing sessions.

## Accounting and security limits

Balances are ledger records, not live bank balances. Opening balances establish history cutoffs; reports cannot infer earlier transactions. Purchases count as spending on posted date; card repayment changes liquid cash and card debt, not spending. Loans, interest, refunds and account signs require careful entry. This MVP is single-owner; no imports, recurring automation, multi-currency, MFA, public registration, or offline financial storage.

Use unique high-entropy secrets, HTTPS, same-origin access, security updates, and tested backups before entering real finances. This initial increment has not undergone a security audit; inspect authorization, CSRF, rate limiting, ownership constraints, and deployment headers before public exposure.
