# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Report it privately through GitHub's
[security advisory form](https://github.com/asadev/spacefield/security/advisories/new).
That opens a private thread visible only to the maintainers.

Include what you found, how to reproduce it, and what an attacker could do
with it. You will get an acknowledgement, and a fix or an explanation of why
it is not a problem.

## Supported versions

This project is maintained on `main`. Fixes land there; there are no
backported release branches.

## If you self-host

A few things are your responsibility, not the code's:

- **Generate your own secrets.** Every secret in `.env.example` is blank on
  purpose. Use `openssl rand -hex 32`, never a value copied from a tutorial.
- **Keep the service-role key server-side.** It bypasses row-level security
  entirely. It must never reach the browser.
- **Set `ADMIN_EMAILS` deliberately.** It is empty by default, which locks
  everyone out of `/admin`. That is the safe default — widen it on purpose.
- **Review the row-level security policies** in `supabase/migrations/` against
  your own threat model before putting real user data in.
