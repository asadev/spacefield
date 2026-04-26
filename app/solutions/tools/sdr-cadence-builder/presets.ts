// Real-world cadence templates and channel-effectiveness data for the SDR cadence builder.
// Sources:
// - Gong.io "2024 Cadence Study" (publicly summarized)
// - Outreach "State of Sales Engagement" reports
// - Predictable Revenue (Ross/Tyler, 2011)
// - Fanatical Prospecting (Blount, 2015)
// - Winning by Design Operating Handbook

export type Channel = "email" | "call" | "linkedin" | "video";

export interface PresetStep {
  day: number;
  channel: Channel;
  note: string;
  template: string;
}

export interface CadenceTemplate {
  key: string;
  name: string;
  variant: "enterprise" | "smb" | "inbound_followup";
  persona:
    | "any"
    | "ceo"
    | "vp_sales"
    | "cfo"
    | "founder"
    | "practitioner"
    | "event";
  source: string;
  description: string;
  steps: PresetStep[];
}

export const CADENCE_TEMPLATES: CadenceTemplate[] = [
  {
    key: "gong_22",
    name: "Gong.io 22-touch enterprise",
    variant: "enterprise",
    persona: "any",
    source: "Gong.io 2024 Cadence Study",
    description:
      "22 touches over 26 days. Optimal for deals > $50k ACV. Reply rate peaks around touch 7–11, most reps quit too early.",
    steps: [
      { day: 1, channel: "email", note: "Personalized intro — reference trigger", template: "Cold — trigger-event opener" },
      { day: 1, channel: "linkedin", note: "View profile + follow", template: "" },
      { day: 2, channel: "call", note: "AM dial + VM", template: "" },
      { day: 3, channel: "email", note: "Short follow-up + value frame", template: "Follow-up — bump (no reply)" },
      { day: 3, channel: "linkedin", note: "Connection request with 1-line note", template: "" },
      { day: 5, channel: "call", note: "PM dial, no VM", template: "" },
      { day: 6, channel: "email", note: "Case study from peer", template: "Cold — peer benchmark" },
      { day: 8, channel: "call", note: "AM dial + VM #2", template: "" },
      { day: 9, channel: "video", note: "Personalized 60-sec Loom", template: "" },
      { day: 10, channel: "email", note: "Video send + CTA", template: "" },
      { day: 12, channel: "linkedin", note: "Engage on recent post", template: "" },
      { day: 13, channel: "call", note: "PM dial", template: "" },
      { day: 14, channel: "email", note: "Different angle — ROI frame", template: "Cold — CFO-specific" },
      { day: 16, channel: "call", note: "AM dial + VM #3", template: "" },
      { day: 17, channel: "linkedin", note: "InMail with specific insight", template: "" },
      { day: 18, channel: "email", note: "Pattern-interrupt one-liner", template: "" },
      { day: 20, channel: "call", note: "PM dial", template: "" },
      { day: 21, channel: "email", note: "Peer reference offer", template: "" },
      { day: 23, channel: "call", note: "AM dial", template: "" },
      { day: 24, channel: "email", note: "Soft break-up", template: "Follow-up — break-up" },
      { day: 26, channel: "call", note: "Final dial", template: "" },
      { day: 26, channel: "email", note: "Break-up", template: "Follow-up — break-up" },
    ],
  },
  {
    key: "outreach_15",
    name: "Outreach 15-touch balanced",
    variant: "enterprise",
    persona: "any",
    source: "Outreach State of Sales Engagement 2024",
    description:
      "Classic 15-touch across 3 weeks. Email-heavy with strategic call + social sprinkled in. Good default.",
    steps: [
      { day: 1, channel: "email", note: "Intro", template: "Cold — pain-led, 3-sentence" },
      { day: 2, channel: "call", note: "AM + VM", template: "" },
      { day: 3, channel: "email", note: "Bump", template: "Follow-up — bump (no reply)" },
      { day: 4, channel: "linkedin", note: "Connect", template: "" },
      { day: 6, channel: "call", note: "PM", template: "" },
      { day: 7, channel: "email", note: "Case study", template: "Cold — peer benchmark" },
      { day: 9, channel: "video", note: "Loom", template: "" },
      { day: 11, channel: "call", note: "AM", template: "" },
      { day: 12, channel: "email", note: "Bump #3", template: "" },
      { day: 14, channel: "linkedin", note: "Engage on post", template: "" },
      { day: 15, channel: "call", note: "PM + VM", template: "" },
      { day: 17, channel: "email", note: "Different angle", template: "" },
      { day: 19, channel: "call", note: "Final attempt", template: "" },
      { day: 20, channel: "email", note: "Break-up", template: "Follow-up — break-up" },
      { day: 21, channel: "linkedin", note: "Final InMail", template: "" },
    ],
  },
  {
    key: "ceo_9",
    name: "CEO-targeted, light-touch",
    variant: "enterprise",
    persona: "ceo",
    source: "Winning by Design Operating Handbook",
    description:
      "9 touches across 18 days. Short, strategic emails. CEOs respond to brevity and peer credibility, not volume.",
    steps: [
      { day: 1, channel: "email", note: "3-sentence intro referencing their recent announcement", template: "Cold — trigger-event opener" },
      { day: 3, channel: "linkedin", note: "Connect + 1-line peer reference", template: "" },
      { day: 5, channel: "email", note: "Peer CEO quote / benchmark", template: "Cold — peer benchmark" },
      { day: 8, channel: "linkedin", note: "Comment on a recent post", template: "" },
      { day: 10, channel: "email", note: "Strategic question — not a pitch", template: "Cold — question open" },
      { day: 13, channel: "video", note: "60-sec Loom addressed to them personally", template: "" },
      { day: 15, channel: "email", note: "Exec-intro framing", template: "" },
      { day: 17, channel: "email", note: "Soft break-up — 'close the loop'", template: "Follow-up — break-up" },
      { day: 18, channel: "linkedin", note: "Final InMail", template: "" },
    ],
  },
  {
    key: "vp_sales_13",
    name: "VP Sales, proof-heavy",
    variant: "enterprise",
    persona: "vp_sales",
    source: "Gong.io 2024",
    description:
      "13 touches, 21 days. Lean on customer references + specific metrics. VPs Sales are tool-fatigued — lead with outcome, not features.",
    steps: [
      { day: 1, channel: "email", note: "Intro referencing their team's tech stack", template: "Cold — pain-led, 3-sentence" },
      { day: 2, channel: "call", note: "AM dial", template: "" },
      { day: 4, channel: "email", note: "3 peer references + their numbers", template: "Cold — peer benchmark" },
      { day: 5, channel: "linkedin", note: "Connect", template: "" },
      { day: 7, channel: "call", note: "PM dial + VM", template: "" },
      { day: 9, channel: "email", note: "Rep-adoption angle", template: "" },
      { day: 11, channel: "call", note: "AM dial", template: "" },
      { day: 13, channel: "video", note: "Loom — time-to-value demo", template: "" },
      { day: 15, channel: "email", note: "ROI model attached", template: "" },
      { day: 17, channel: "call", note: "PM dial", template: "" },
      { day: 19, channel: "email", note: "Different angle — consolidation", template: "" },
      { day: 20, channel: "linkedin", note: "InMail", template: "" },
      { day: 21, channel: "email", note: "Break-up", template: "Follow-up — break-up" },
    ],
  },
  {
    key: "cfo_8",
    name: "CFO, numbers-only",
    variant: "enterprise",
    persona: "cfo",
    source: "Winning by Design",
    description:
      "8 touches, 14 days. Every message leads with a number or a question about a number. Skip LinkedIn (most CFOs don't engage). Keep it tight.",
    steps: [
      { day: 1, channel: "email", note: "ROI model teaser — specific dollar outcome", template: "Cold — CFO-specific" },
      { day: 3, channel: "call", note: "AM dial + VM", template: "" },
      { day: 5, channel: "email", note: "Peer benchmark by ARR band", template: "Cold — peer benchmark" },
      { day: 7, channel: "call", note: "PM dial", template: "" },
      { day: 9, channel: "email", note: "Question open — their numbers", template: "Cold — question open" },
      { day: 11, channel: "email", note: "Follow-up w/ ROI calculator link", template: "" },
      { day: 13, channel: "call", note: "Final dial", template: "" },
      { day: 14, channel: "email", note: "Break-up", template: "Follow-up — break-up" },
    ],
  },
  {
    key: "founder_11",
    name: "Founder-led (technical)",
    variant: "enterprise",
    persona: "founder",
    source: "Winning by Design + Predictable Revenue",
    description:
      "11 touches, 20 days. Casual tone, technical depth fast. Founders hate marketing speak. Open-source, API, self-serve angles work.",
    steps: [
      { day: 1, channel: "email", note: "Casual 2-sentence intro + technical detail", template: "" },
      { day: 3, channel: "linkedin", note: "Follow + engage on technical post", template: "" },
      { day: 5, channel: "email", note: "API / architecture discussion", template: "" },
      { day: 7, channel: "video", note: "Loom walking through a technical demo", template: "" },
      { day: 9, channel: "email", note: "Peer founder reference", template: "Cold — mutual connection" },
      { day: 11, channel: "call", note: "AM dial — short pitch", template: "" },
      { day: 13, channel: "email", note: "Self-serve / pilot offer", template: "" },
      { day: 15, channel: "linkedin", note: "DM with a specific insight", template: "" },
      { day: 17, channel: "email", note: "'This might not be right for you' — reverse psych", template: "" },
      { day: 19, channel: "call", note: "Final dial", template: "" },
      { day: 20, channel: "email", note: "Break-up", template: "Follow-up — break-up" },
    ],
  },
  {
    key: "practitioner_14",
    name: "Practitioner (user) cadence",
    variant: "smb",
    persona: "practitioner",
    source: "Outreach State of Sales Engagement",
    description:
      "14 touches across 18 days. Users care about workflow fit and day-to-day experience. Emphasize integrations, time-to-first-value, community.",
    steps: [
      { day: 1, channel: "email", note: "'Monday morning' workflow framing", template: "Cold — pain-led, 3-sentence" },
      { day: 2, channel: "call", note: "AM", template: "" },
      { day: 3, channel: "linkedin", note: "Connect", template: "" },
      { day: 5, channel: "email", note: "Integration proof", template: "" },
      { day: 6, channel: "call", note: "PM", template: "" },
      { day: 7, channel: "email", note: "Peer user quote", template: "Cold — peer benchmark" },
      { day: 9, channel: "video", note: "30-sec 'feature in action'", template: "" },
      { day: 10, channel: "call", note: "AM", template: "" },
      { day: 11, channel: "email", note: "'Help-me-sell-internally' framing", template: "" },
      { day: 13, channel: "call", note: "PM", template: "" },
      { day: 14, channel: "linkedin", note: "InMail with community link", template: "" },
      { day: 16, channel: "email", note: "Trial / self-serve", template: "" },
      { day: 17, channel: "call", note: "Final dial", template: "" },
      { day: 18, channel: "email", note: "Break-up", template: "Follow-up — break-up" },
    ],
  },
  {
    key: "smb_short",
    name: "SMB 7-touch sprint",
    variant: "smb",
    persona: "any",
    source: "Fanatical Prospecting (Blount)",
    description:
      "7 touches, 10 days. SMB cycles are compressed — get in and out. Higher call weight than enterprise.",
    steps: [
      { day: 1, channel: "email", note: "Short intro", template: "Cold — pain-led, 3-sentence" },
      { day: 2, channel: "call", note: "Dial #1", template: "" },
      { day: 3, channel: "email", note: "Bump", template: "Follow-up — bump (no reply)" },
      { day: 5, channel: "call", note: "Dial #2 + VM", template: "" },
      { day: 7, channel: "email", note: "Case study", template: "Cold — peer benchmark" },
      { day: 9, channel: "call", note: "Dial #3", template: "" },
      { day: 10, channel: "email", note: "Break-up", template: "Follow-up — break-up" },
    ],
  },
  {
    key: "inbound_fast",
    name: "Inbound speed-to-lead",
    variant: "inbound_followup",
    persona: "any",
    source: "HBR 'Lead response management' (Oldroyd, 2011)",
    description:
      "Contact within 5 minutes increases qualification odds 21x vs. 30 min. 8 touches across 10 days if no booking.",
    steps: [
      { day: 0, channel: "email", note: "Auto-reply — confirm + calendar link (<5 min)", template: "" },
      { day: 0, channel: "call", note: "Dial within 5 min of form submit", template: "" },
      { day: 0, channel: "email", note: "Personal note from AE (within 2 hrs)", template: "" },
      { day: 1, channel: "call", note: "Dial #2 if no booking", template: "" },
      { day: 2, channel: "email", note: "Case study match to their form answers", template: "" },
      { day: 4, channel: "call", note: "Dial #3", template: "" },
      { day: 7, channel: "email", note: "Re-engage / keep warm", template: "" },
      { day: 10, channel: "email", note: "Break-up", template: "Follow-up — break-up" },
    ],
  },
  {
    key: "event_warm",
    name: "Post-event warm follow-up",
    variant: "inbound_followup",
    persona: "event",
    source: "Winning by Design",
    description:
      "9 touches, 14 days. Fast, high-touch follow-up while the event is fresh. First email within 4 hours of event end.",
    steps: [
      { day: 0, channel: "email", note: "Personal 'nice to meet you' within 4 hrs", template: "" },
      { day: 1, channel: "linkedin", note: "Connect + reference convo", template: "" },
      { day: 2, channel: "email", note: "Resource they asked about", template: "" },
      { day: 3, channel: "call", note: "AM dial", template: "" },
      { day: 5, channel: "email", note: "Meeting request", template: "Meeting — request (short)" },
      { day: 7, channel: "call", note: "PM dial", template: "" },
      { day: 9, channel: "email", note: "Bump", template: "Follow-up — bump (no reply)" },
      { day: 12, channel: "linkedin", note: "InMail", template: "" },
      { day: 14, channel: "email", note: "Break-up", template: "Follow-up — break-up" },
    ],
  },
];

// Channel effectiveness benchmarks (blended industry averages, B2B SaaS)
// All numbers sourced from Gong.io 2024 Cadence Study + Outreach 2024 SOE report.
export const CHANNEL_EFFECTIVENESS: Record<
  Channel,
  {
    responseRate: number; // %
    connectRate: number; // % (for calls) or engagement (others)
    timeCost: number; // minutes per touch
    bestUseCase: string;
  }
> = {
  email: {
    responseRate: 2.1,
    connectRate: 0,
    timeCost: 3,
    bestUseCase:
      "Scalable first-touch and async depth. Reply rates 1.5–3% on cold, 8–15% on warm.",
  },
  call: {
    responseRate: 6.3, // live conversation rate
    connectRate: 18.0, // connect-to-dial
    timeCost: 8,
    bestUseCase:
      "Highest conversion per touch. Connect rate ~18% cold, live conversation ~6%. Best Tue–Thu 10am or 4pm local.",
  },
  linkedin: {
    responseRate: 5.4,
    connectRate: 28.0, // connection accept rate
    timeCost: 4,
    bestUseCase:
      "Warm-up + credibility. ~28% accept rate on personalized connects. InMail reply ~5–7%.",
  },
  video: {
    responseRate: 8.1,
    connectRate: 0,
    timeCost: 10,
    bestUseCase:
      "Pattern-interrupt. Personalized Loom videos get ~8% reply rate — highest of any cold channel, but time-expensive.",
  },
};

// Expected touches to response, from Gong.io 2024 Cadence Study.
// Based on 3M+ outbound cadence runs in B2B SaaS.
export const TOUCHES_TO_RESPONSE = {
  cold_enterprise: { p50: 9, p80: 14, p95: 22 },
  cold_smb: { p50: 5, p80: 8, p95: 13 },
  inbound: { p50: 2, p80: 4, p95: 7 },
  warm_event: { p50: 3, p80: 6, p95: 10 },
};
