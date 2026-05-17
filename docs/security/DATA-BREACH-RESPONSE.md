# Data breach response

The plan for when user data is exposed, exfiltrated, or believed to
be. Optimized for the realistic case: a solo founder learns about an
incident at an inconvenient hour, has 72 hours of GDPR clock running,
and needs to do the right things in the right order.

## First 24 hours

A focused checklist. Do not skip ahead.

### Hour 0 — Contain

- [ ] **Confirm the incident is real.** Reproduce or get convincing
      evidence (logs, screenshots, working PoC). Hoaxes and false
      alarms happen — confirming first prevents an unnecessary panic.
- [ ] **Identify the attack vector.** Is it still active? If yes,
      proceed to kill-switch. If unclear, assume yes.
- [ ] **Kill-switch.** Options, in order of preference:
      - Patch the vector and deploy (fastest if obvious + small).
      - Disable the affected feature via the maintenance banner +
        feature flag (`/admin/banners` + `/admin/feature-flags`).
      - Rotate the affected secret (see `SECRETS-ROTATION.md`).
      - Last resort: turn on global maintenance mode at `/admin/maintenance`.
- [ ] **Snapshot evidence.** Export relevant logs (`audit_log`,
      `error_log`, Vercel runtime logs, Supabase project logs) BEFORE
      they roll off. Save to a non-public S3 bucket with a date prefix.

### Hour 1–6 — Scope

- [ ] **Determine the blast radius.** Which tables? Which users? Which
      time range? Use `audit_log` + Supabase query logs.
- [ ] **Determine the data sensitivity.** Was it: email addresses
      only? Hashed passwords? Plaintext content? Billing data? Health
      data? The severity tier shapes everything downstream.
- [ ] **List the regulatory triggers.** EU users in scope → GDPR
      72-hour clock starts NOW. California users in scope → CCPA.
      UAE/KSA users → relevant local laws. UK users → UK GDPR.
- [ ] **Inform Asad's co-counsel / lawyer** if the severity is above
      "email address only". (We don't have retainer counsel; the
      decision-tree is: above this bar, find one.)

### Hour 6–24 — Plan

- [ ] **Draft the user-facing communication.** Use the template
      below. Get it reviewed by counsel BEFORE sending.
- [ ] **Identify the channel.** Email is the default. Plus
      in-product banner at `/admin/banners` set to severity=error
      with the same wording.
- [ ] **Identify the affected users.** SQL the list. Export to CSV in
      the same evidence S3 bucket.
- [ ] **Set a comms deadline.** The plan says we will email the
      affected users by hour X. Stick to X.

## The 72-hour GDPR notification

If EU user personal data was exposed, the supervisory authority must
be notified within 72 hours of becoming aware. We notify the **Irish
Data Protection Commission (DPC)** — our lead supervisory authority
because we have no EU office.

- Notification portal: <https://forms.dataprotection.ie/breach>
- Required fields (have these ready):
  - Nature of the breach + categories of data
  - Approximate number of data subjects + records
  - Likely consequences
  - Measures taken or proposed
  - Name + contact of the data-protection point person (Asad)

If we can't fill every field within 72 hours, file with what we have
and submit additional information later. Late notification is worse
than incomplete notification.

## User comms templates

### Email — "minor exposure" (email address only)

> Subject: A security update from Space Field
>
> Hi [name],
>
> We want to let you know about a security issue we recently detected
> and fixed. Between [date range], a misconfiguration meant your
> account email address was potentially visible to other Space Field
> users. We do not believe any other information — your workspace
> contents, passwords, or billing details — was exposed.
>
> What we've done: closed the issue, audited similar code paths,
> rotated the affected credentials.
>
> What you should do: nothing immediate. If you reuse your Space
> Field email password anywhere else, change it there.
>
> If you have questions, reply to this email and a real human (me)
> will respond.
>
> — Asad, Space Field

### Email — "material exposure" (content / billing / hashed passwords)

> Subject: Important: a security incident affecting your Space Field account
>
> Hi [name],
>
> I'm writing to let you know about a security incident at Space
> Field that affects your account. Between [date range], [precise
> description of what data was exposed and how].
>
> Specifically, the following data of yours may have been accessed:
> [enumerated list].
>
> We do NOT believe the following was exposed: [enumerated list].
>
> What we've done: [bulleted list of corrective actions].
>
> What you should do:
> 1. Change your Space Field password (if you use one).
> 2. [Action 2 — e.g. rotate API tokens, review recent activity].
> 3. [Action 3 — e.g. monitor your card for fraudulent charges].
>
> We have notified [the Irish DPC / other authority] as required by
> law. We have engaged [counsel / forensics firm] to assist with the
> investigation.
>
> I take full responsibility for this. If you want to talk to me
> directly, reply to this email or call [phone].
>
> — Asad, Space Field

### In-product banner

Use `/admin/banners` with severity = error, audience = `affected` (or
`all` if the scope is everyone). Wording: short, links to the email
or to a public post-mortem page.

> "On [date] we detected and fixed a security issue. If you may be
> affected, please check your email — we sent details to your
> registered address. [Read the full post-mortem]"

## After the dust settles

Within 14 days:

- [ ] Write a public post-mortem (`/incidents/YYYY-MM-DD-<slug>.md`).
      No marketing spin. What broke, why, how we fixed it, what we
      changed so it doesn't happen again.
- [ ] Add the failure mode to `docs/security/OWASP-ASVS-L1.md` as a
      regression-prevention control.
- [ ] Update this document if anything in the response surprised us.
- [ ] If counsel was involved, archive their guidance in a private
      memory file (not committed).
- [ ] If the incident touched a third-party (Supabase, Vercel, Paddle,
      Resend), notify their security team. They often have an
      obligation back to us.
