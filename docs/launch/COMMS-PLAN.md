# Launch Comms Plan

> Pre-launch through post-launch communications playbook. Pair with
> [RUNBOOK.md](./RUNBOOK.md), [PRODUCT-HUNT.md](./PRODUCT-HUNT.md), and
> [PRESS-RELEASE-TEMPLATE.md](./PRESS-RELEASE-TEMPLATE.md).

## Channels & owner

| Channel | Owner | Cadence on launch day |
|---|---|---|
| Twitter/X — `@spacefield` | Owner | 6 posts (T+0/2/4/6/8/10h) |
| LinkedIn — personal + page | Owner | 1 long-form + 2 short |
| Product Hunt | the maintainer + Hunter | See [PRODUCT-HUNT.md](./PRODUCT-HUNT.md) |
| Hacker News (Show HN) | Owner | 1 post, reply to every comment ≤2h |
| Email blast (Resend) | Owner | Single send at T+0:30 |
| In-app banner | Owner | Auto-on via admin banners table |
| Discord/Slack of friends | Owner | Soft-share at T-1h |

---

## Pre-launch sequence

### T-14 — Tease
- Twitter: vague screenshot, no name. "Building something for solo
  operators. Two weeks."
- LinkedIn: same screenshot, longer caption about why.
- Email list: subject `Two weeks` — single screenshot, single CTA
  `Tell me what you want it to do`.

### T-10 — Build email list
- Landing page swap: from "join waitlist" to "join the launch list, get
  the founder code". Resend automation tags as `prelaunch-2026`.
- Twitter: pin tweet with the landing-page link.

### T-7 — Hunter outreach
- Book Product Hunt hunter (see [PRODUCT-HUNT.md](./PRODUCT-HUNT.md)).
- Confirm post date and slot.

### T-3 — Press embargo
- Send embargoed press release to journalist list — see
  [JOURNALIST-LIST.md](../marketing/JOURNALIST-LIST.md). Embargo lifts T+0.

### T-1 — Final ping
- Email list: "Tomorrow at 9am Dubai time."
- Twitter: countdown post.
- LinkedIn: founder story long-form, scheduled to publish T+0:00.

### T-0:30 — War room open
- See [WAR-ROOM.md](./WAR-ROOM.md). Everyone in seat.

---

## Launch day

| Time (Dubai) | Action | Template |
|---|---|---|
| T+0:00 | Product Hunt goes live | PH template, see PRODUCT-HUNT.md |
| T+0:05 | Twitter launch tweet | `tw-launch` below |
| T+0:10 | LinkedIn long-form publishes | `li-launch` below |
| T+0:15 | Show HN post | `hn-launch` below |
| T+0:30 | Email blast | `email-launch` below |
| T+1:00 | In-app banner enabled | banners table |
| T+2:00 | First milestone tweet ("we're #X on PH") | ad-hoc |
| T+4:00 | Reply-everywhere sweep | — |
| T+6:00 | Mid-day stats tweet | — |
| T+10:00 | Founder reflection thread | — |

---

## Templates

### `tw-launch`
```
spacefield is live.

it's an AI operating system for solo operators — CRM, content,
proposals, market data, all under one login.

20+ tools, one workspace, no monthly bloat.

try free → spacefield.co

(launch thread below ↓)
```

### `li-launch` (long-form)
Story-first. Founder background → pain → why now → what it does →
who it's for → call to action. 6 paragraphs, no bullet points.

### `hn-launch` (Show HN)
```
Show HN: Spacefield — AI operating system for solo operators

I'm a real-estate broker in Dubai who got tired of paying for 11
SaaS tools that each did one thing. So I built one workspace that
does the 20 things solo operators actually do, and let an AI agent
drive them.

Stack: Next.js 16, Supabase, Anthropic, Paddle. Free tier on
launch, paid plans below.

I'd love feedback on (a) the tool catalogue — what's missing, and
(b) the agent — does it actually help or does it get in the way.

https://spacefield.co
```

### `email-launch`
- Subject: `It's live`
- Body: 3 lines + screenshot + button. Don't oversell.

---

## Post-launch follow-ups

### T+24h
- Tweet: "24 hours in: X signups, Y tools used, Z things I broke."
- Reply to every Show HN comment that's still active.

### T+72h
- LinkedIn: lessons learned thread.
- Email list: thank-you + "here's what we shipped because you asked".

### T+7d
- Blog post: full launch retrospective.
- Customer-story sourcing from early signups.

### T+14d
- "What's next" roadmap post.
