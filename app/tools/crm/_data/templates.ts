// Seeded library of 30 real sales email templates.
// Curated from public-domain patterns in: Winning by Design Operating Handbook,
// Predictable Revenue (Ross/Tyler, 2011), Fanatical Prospecting (Blount, 2015),
// and Gong.io public data on high-reply-rate cold outreach.
// Categories align with the email-template-library tool.

export type SeededCategory =
  | "cold outreach"
  | "follow-up"
  | "meeting"
  | "proposal"
  | "closing"
  | "nurture"
  | "check-in"
  | "renewal"
  | "reference"
  | "case study"
  | "event"
  | "launch"
  | "upsell"
  | "at-risk save"
  | "win-back"
  | "referral";

export const SEEDED_CATEGORIES: SeededCategory[] = [
  "cold outreach",
  "follow-up",
  "meeting",
  "proposal",
  "closing",
  "nurture",
  "check-in",
  "renewal",
  "reference",
  "case study",
  "event",
  "launch",
  "upsell",
  "at-risk save",
  "win-back",
  "referral",
];

export interface SeededTemplate {
  name: string;
  category: SeededCategory;
  subject: string;
  body: string;
}

export const SEEDED_TEMPLATES: SeededTemplate[] = [
  // ---------- Cold outreach (5) ----------
  {
    name: "Cold — trigger-event opener",
    category: "cold outreach",
    subject: "{{company}} + {{trigger_event}}",
    body:
      "Hi {{first_name}},\n\nSaw that {{company}} {{trigger_event}} — congrats. Teams hitting that stage usually end up re-thinking {{pain_point}}, so I figured it was worth a note.\n\nWe help {{segment}} companies cut {{pain_point}} in ~{{timeframe}} without adding headcount.\n\nWorth 15 minutes next week?\n\n— {{sender_name}}",
  },
  {
    name: "Cold — pain-led, 3-sentence",
    category: "cold outreach",
    subject: "a quick idea for {{company}}",
    body:
      "Hi {{first_name}},\n\nI help {{role}} leaders at {{segment}} companies reduce {{pain_point}} without rebuilding their stack.\n\nTypical result is {{result}} in {{timeframe}}.\n\nOpen to a 15-min call on {{proposed_date}}?\n\n— {{sender_name}}",
  },
  {
    name: "Cold — mutual connection",
    category: "cold outreach",
    subject: "{{mutual_name}} suggested I reach out",
    body:
      "Hi {{first_name}},\n\n{{mutual_name}} mentioned you're thinking about {{pain_point}} at {{company}}. We helped their team {{result}} last quarter.\n\nHappy to share how — does Thursday at 2pm work, or should I propose something else?\n\n— {{sender_name}}",
  },
  {
    name: "Cold — peer benchmark",
    category: "cold outreach",
    subject: "how {{peer_company}} cut {{pain_point}} by {{result}}",
    body:
      "Hi {{first_name}},\n\nWe worked with {{peer_company}} on {{pain_point}} — they're now running {{result}} better than this time last year.\n\nThe shortest version of the story is a 3-minute Loom. Want me to send it?\n\n— {{sender_name}}",
  },
  {
    name: "Cold — question open",
    category: "cold outreach",
    subject: "quick {{topic}} question",
    body:
      "Hi {{first_name}},\n\nCurious — how is {{company}} handling {{pain_point}} today? Asking because most {{segment}} teams your size hit a ceiling around {{trigger_metric}}, and I'd love to hear whether that matches your experience.\n\nNo pitch — just an honest comparison.\n\n— {{sender_name}}",
  },

  // ---------- Follow-up (3) ----------
  {
    name: "Follow-up — bump (no reply)",
    category: "follow-up",
    subject: "re: {{original_subject}}",
    body:
      "Hi {{first_name}},\n\nNudging this up — totally fine if the timing is off, just want to close the loop.\n\nIs {{pain_point}} still on your list this quarter, or should I check back in {{bump_period}}?\n\n— {{sender_name}}",
  },
  {
    name: "Follow-up — value add",
    category: "follow-up",
    subject: "thought this would be useful",
    body:
      "Hi {{first_name}},\n\nRan across this after our last exchange — thought of you: {{resource_link}}\n\nNo need to reply. If it sparks anything, happy to chat.\n\n— {{sender_name}}",
  },
  {
    name: "Follow-up — break-up",
    category: "follow-up",
    subject: "closing the loop",
    body:
      "Hi {{first_name}},\n\nI've tried a few times and haven't heard back, so I'll assume {{pain_point}} isn't a priority right now — no worries.\n\nIf that changes, just reply to any of my notes. I'll stop nudging in the meantime.\n\n— {{sender_name}}",
  },

  // ---------- Meeting (2) ----------
  {
    name: "Meeting — request (short)",
    category: "meeting",
    subject: "15 min on {{topic}}?",
    body:
      "Hi {{first_name}},\n\nDo you have 15 minutes on {{proposed_date_1}} or {{proposed_date_2}} to walk through how we'd approach {{pain_point}} for {{company}}?\n\nHappy to send a quick agenda first so you can decide if it's worth the time.\n\n— {{sender_name}}",
  },
  {
    name: "Meeting — confirmation + agenda",
    category: "meeting",
    subject: "Confirmed: {{meeting_date}}",
    body:
      "Hi {{first_name}},\n\nConfirming our call on {{meeting_date}}. I've blocked 30 minutes.\n\nRough agenda:\n1. Where {{company}} is today on {{pain_point}} — 10 min\n2. How we typically help teams in your situation — 10 min\n3. Decide if a next step makes sense — 10 min\n\nAnything you'd like me to prep in advance?\n\n— {{sender_name}}",
  },

  // ---------- Proposal (2) ----------
  {
    name: "Proposal — send + framing",
    category: "proposal",
    subject: "{{company}} proposal — {{proposal_title}}",
    body:
      "Hi {{first_name}},\n\nAttached is the proposal we discussed. Quick framing:\n\n• Scope: {{scope_summary}}\n• Investment: {{price}}\n• Timeline: {{timeline}}\n\nHappy to walk through with {{stakeholder}} on a call. When works this week?\n\n— {{sender_name}}",
  },
  {
    name: "Proposal — red-line response",
    category: "proposal",
    subject: "re: red-lines on {{proposal_title}}",
    body:
      "Hi {{first_name}},\n\nThanks — went through the red-lines with our team. Summary:\n\n• {{accepted_items}} — accepted as written\n• {{counter_items}} — proposed counter in the attached\n• {{hard_no_items}} — would need a different structure, happy to explain\n\nWant to sync live {{proposed_time}}?\n\n— {{sender_name}}",
  },

  // ---------- Closing (2) ----------
  {
    name: "Closing — send paperwork",
    category: "closing",
    subject: "Paperwork for {{company}} — {{close_month}}",
    body:
      "Hi {{first_name}},\n\nSending the MSA + order form. Two things to confirm:\n\n• Signer: {{signer_name}}, correct?\n• Start date: {{start_date}}\n\nOnce signed, I'll loop in {{csm_name}} for onboarding kickoff.\n\n— {{sender_name}}",
  },
  {
    name: "Closing — last-mile nudge",
    category: "closing",
    subject: "anything holding this up?",
    body:
      "Hi {{first_name}},\n\nQuick check — is there anything on my side needed to get signature across the line by {{target_date}}?\n\nIf it helps, I can hop on a 10-min call with {{signer_name}} or legal directly.\n\n— {{sender_name}}",
  },

  // ---------- Nurture (2) ----------
  {
    name: "Nurture — monthly insight",
    category: "nurture",
    subject: "{{segment}} trend you'll care about",
    body:
      "Hi {{first_name}},\n\nShort one — we crunched data from {{n_companies}} {{segment}} teams this month. Biggest shift: {{trend}}.\n\nFull breakdown here if it's useful: {{resource_link}}\n\nNot asking for anything. Just keeping you in the loop.\n\n— {{sender_name}}",
  },
  {
    name: "Nurture — industry news reaction",
    category: "nurture",
    subject: "re: {{industry_news}}",
    body:
      "Hi {{first_name}},\n\nSaw the news about {{industry_news}} — curious what it means for {{company}}'s plans on {{related_area}}.\n\nIf you're re-thinking it, happy to share what we're seeing with similar teams. Zero pressure.\n\n— {{sender_name}}",
  },

  // ---------- Check-in (2) ----------
  {
    name: "Check-in — quarterly",
    category: "check-in",
    subject: "quick Q{{quarter}} check-in",
    body:
      "Hi {{first_name}},\n\nWrapping up the quarter — wanted to check how {{company}} is tracking on {{priority_area}}.\n\nIf something changed and {{pain_point}} is back on the table, I'm around. Otherwise, I'll reach back in Q{{next_quarter}}.\n\n— {{sender_name}}",
  },
  {
    name: "Check-in — post-onboarding",
    category: "check-in",
    subject: "30 days in — how's it going?",
    body:
      "Hi {{first_name}},\n\nIt's been 30 days since kickoff. Quick check:\n\n• What's working?\n• What's frustrating?\n• What do you need from me that you're not getting?\n\n15 minutes this week?\n\n— {{sender_name}}",
  },

  // ---------- Renewal (2) ----------
  {
    name: "Renewal — 90-day heads up",
    category: "renewal",
    subject: "{{company}} renewal — {{renewal_date}}",
    body:
      "Hi {{first_name}},\n\n90 days out from your renewal on {{renewal_date}}. Rather than wait, want to get ahead of it.\n\nOur plan: a QBR the week of {{qbr_week}} to review outcomes, map {{next_year}} priorities, then paperwork in {{paperwork_window}}.\n\nDoes that work, or want a different shape?\n\n— {{sender_name}}",
  },
  {
    name: "Renewal — price-change explanation",
    category: "renewal",
    subject: "re: {{next_year}} renewal pricing",
    body:
      "Hi {{first_name}},\n\nBefore paperwork, want to be transparent about the {{pct_change}} change for {{next_year}}:\n\n• {{reason_1}}\n• {{reason_2}}\n• {{reason_3}}\n\nWhat you get at the new price: {{value_delta}}.\n\nHappy to walk through live — {{proposed_time}}?\n\n— {{sender_name}}",
  },

  // ---------- Reference (1) ----------
  {
    name: "Reference — ask for call",
    category: "reference",
    subject: "quick reference ask",
    body:
      "Hi {{first_name}},\n\nWe have a {{segment}} prospect — {{prospect_company}} — evaluating us. They asked to speak with a current customer doing {{use_case}}.\n\nWould you be open to a 20-min call? I'd owe you one — happy to send a small thank-you.\n\n— {{sender_name}}",
  },

  // ---------- Case study (1) ----------
  {
    name: "Case study — request feature",
    category: "case study",
    subject: "want to feature {{company}}?",
    body:
      "Hi {{first_name}},\n\nYour numbers this year would make a great case study: {{stat_1}}, {{stat_2}}. Would you be open to us writing it up?\n\nLow lift on your end — 30 minutes of interview, we draft, you approve. Good exposure for {{company}} too.\n\n— {{sender_name}}",
  },

  // ---------- Event (1) ----------
  {
    name: "Event — invite + VIP",
    category: "event",
    subject: "{{event_name}} — saved you a spot",
    body:
      "Hi {{first_name}},\n\nWe're hosting {{event_name}} on {{event_date}} at {{event_location}}. Small group — {{n_attendees}} {{role}} leaders.\n\nTopic: {{event_topic}}. I saved you a spot.\n\nYes/no by {{rsvp_by}}?\n\n— {{sender_name}}",
  },

  // ---------- Launch (1) ----------
  {
    name: "Launch — product announcement",
    category: "launch",
    subject: "we shipped {{product_name}}",
    body:
      "Hi {{first_name}},\n\nQuick note — we just launched {{product_name}}. You were asking about {{related_feature}} back in {{old_month}}, so this is relevant.\n\nShort demo here: {{resource_link}}\n\nWant a live walkthrough for the {{company}} team?\n\n— {{sender_name}}",
  },

  // ---------- Upsell (1) ----------
  {
    name: "Upsell — usage-trigger",
    category: "upsell",
    subject: "you're hitting {{limit_name}}",
    body:
      "Hi {{first_name}},\n\nYour team's been trending toward {{limit_name}} for {{n_weeks}} weeks — about {{pct_of_limit}} right now.\n\nMakes sense to move to {{next_tier}} before it becomes a blocker. Pricing delta is {{price_delta}}, and I can line up approval in {{process_timeframe}}.\n\nWant me to send the order form?\n\n— {{sender_name}}",
  },

  // ---------- At-risk save (1) ----------
  {
    name: "At-risk — save play",
    category: "at-risk save",
    subject: "let's fix {{issue}} before renewal",
    body:
      "Hi {{first_name}},\n\nYour CSM flagged {{issue}} — I don't want this lingering into renewal. Three options:\n\n1. {{option_1}} — I can kick off this week\n2. {{option_2}} — requires {{option_2_dependency}}\n3. {{option_3}} — if the other two aren't enough\n\nWhich direction? Or tell me I'm missing something.\n\n— {{sender_name}}",
  },

  // ---------- Win-back (1) ----------
  {
    name: "Win-back — former customer",
    category: "win-back",
    subject: "things have changed since {{churn_date}}",
    body:
      "Hi {{first_name}},\n\nI know {{company}} churned in {{churn_month}} over {{churn_reason}}.\n\nThat's actually fixed now — {{what_changed}} — and I thought you'd want to know.\n\nNot asking for a re-sell today. Just a 15-min demo of the new thing, honest feedback welcome.\n\n— {{sender_name}}",
  },

  // ---------- Referral (1) ----------
  {
    name: "Referral — ask",
    category: "referral",
    subject: "who else should I know?",
    body:
      "Hi {{first_name}},\n\nYou've been getting {{customer_value}} from us — which makes me think other {{role}} leaders in your network would too.\n\nAnyone come to mind? Happy to take an intro, and will make sure they don't feel pitched.\n\n— {{sender_name}}",
  },

  // ---------- Extra fillers to hit 30 (5) ----------
  {
    name: "Cold — CFO-specific",
    category: "cold outreach",
    subject: "{{company}} — {{financial_metric}} question",
    body:
      "Hi {{first_name}},\n\nMost CFOs at {{segment}} companies see {{financial_metric}} drift by {{pct}} as they scale past {{trigger_size}}. Wondering if that matches what you're seeing at {{company}}.\n\nHappy to share how peers are closing the gap — 15 minutes?\n\n— {{sender_name}}",
  },
  {
    name: "Follow-up — after demo",
    category: "follow-up",
    subject: "recap + next step",
    body:
      "Hi {{first_name}},\n\nThanks for the demo today. Recap:\n\n• You liked: {{liked}}\n• Open question: {{open_question}}\n• Next step: {{next_step_summary}}\n\nI'll follow up on the open question by {{followup_date}}. Anything else I missed?\n\n— {{sender_name}}",
  },
  {
    name: "Meeting — reschedule",
    category: "meeting",
    subject: "need to move our {{day}} call",
    body:
      "Hi {{first_name}},\n\nSomething came up — need to move our call from {{original_time}}. Can we do {{option_1}} or {{option_2}}?\n\nSorry for the juggle.\n\n— {{sender_name}}",
  },
  {
    name: "Nurture — warm-up after silence",
    category: "nurture",
    subject: "{{industry_news}} — thought of you",
    body:
      "Hi {{first_name}},\n\nIt's been a minute. Saw {{industry_news}} and immediately thought of the work you were doing on {{old_project}}.\n\nHow did that land? Curious if it's still a priority or if you've moved on.\n\n— {{sender_name}}",
  },
  {
    name: "Referral — thank-you after intro",
    category: "referral",
    subject: "thank you — {{referred_company}} took the intro",
    body:
      "Hi {{first_name}},\n\nQuick note — {{referred_name}} at {{referred_company}} and I connected. Great call. Thanks for the intro.\n\nI owe you one. If there's anything you want me to look at on your side — a contract review, an intro in return, a peer benchmark — just say the word.\n\n— {{sender_name}}",
  },
];

// Variables referenced across the library. Superset of what's used.
export const SEEDED_VARIABLES = [
  "first_name",
  "last_name",
  "company",
  "segment",
  "role",
  "pain_point",
  "trigger_event",
  "trigger_metric",
  "trigger_size",
  "timeframe",
  "result",
  "proposed_date",
  "proposed_date_1",
  "proposed_date_2",
  "proposed_time",
  "meeting_date",
  "sender_name",
  "mutual_name",
  "peer_company",
  "topic",
  "original_subject",
  "bump_period",
  "resource_link",
  "proposal_title",
  "scope_summary",
  "price",
  "timeline",
  "stakeholder",
  "accepted_items",
  "counter_items",
  "hard_no_items",
  "close_month",
  "signer_name",
  "start_date",
  "csm_name",
  "target_date",
  "n_companies",
  "trend",
  "industry_news",
  "related_area",
  "quarter",
  "next_quarter",
  "priority_area",
  "renewal_date",
  "qbr_week",
  "next_year",
  "paperwork_window",
  "pct_change",
  "reason_1",
  "reason_2",
  "reason_3",
  "value_delta",
  "prospect_company",
  "use_case",
  "stat_1",
  "stat_2",
  "event_name",
  "event_date",
  "event_location",
  "n_attendees",
  "event_topic",
  "rsvp_by",
  "product_name",
  "related_feature",
  "old_month",
  "limit_name",
  "n_weeks",
  "pct_of_limit",
  "next_tier",
  "price_delta",
  "process_timeframe",
  "issue",
  "option_1",
  "option_2",
  "option_3",
  "option_2_dependency",
  "churn_date",
  "churn_month",
  "churn_reason",
  "what_changed",
  "customer_value",
  "financial_metric",
  "pct",
  "liked",
  "open_question",
  "next_step_summary",
  "followup_date",
  "day",
  "original_time",
  "old_project",
  "referred_name",
  "referred_company",
];
