"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

type Template =
  | "discovery"
  | "demo"
  | "objection"
  | "closing"
  | "bant"
  | "meddpicc"
  | "challenger"
  | "spin";

interface ScriptState {
  template: Template;
  company: string;
  product: string;
  opener: string;
  agenda: string;
  qualifying: string;
  valueProps: string;
  objections: string;
  nextSteps: string;
}

const LS_KEY = "solutions:sales-call-script-builder:v1";
const MODE_LS_KEY = "solutions:sales-call-script-builder:mode:v1";

const TEMPLATES: { key: Template; label: string; source?: string }[] = [
  { key: "discovery", label: "Discovery" },
  { key: "demo", label: "Demo" },
  { key: "objection", label: "Objection" },
  { key: "closing", label: "Closing" },
  { key: "bant", label: "BANT", source: "IBM / classic" },
  { key: "meddpicc", label: "MEDDPICC", source: "Force Mgmt / PTC" },
  { key: "challenger", label: "Challenger", source: "Dixon & Adamson, 2011" },
  { key: "spin", label: "SPIN", source: "Rackham, 1988" },
];

// Role-play buyer personas with typical objections (industry-common patterns)
const BUYER_PERSONAS: {
  key: string;
  name: string;
  title: string;
  style: string;
  topObjections: string[];
}[] = [
  {
    key: "ceo",
    name: "Morgan (CEO)",
    title: "Founder & CEO, Series B SaaS",
    style:
      "Time-compressed, strategy-first, interrupts for the bottom line. Will test whether you understand her business, not your product.",
    topObjections: [
      "'We can build this in-house in 6 weeks.' — wants you to quantify opportunity cost.",
      "'Why you, not your competitor?' — wants differentiation, not feature list.",
      "'We're heads-down on fundraising — call me in Q3.' — timing deflection.",
    ],
  },
  {
    key: "cfo",
    name: "Dmitri (CFO)",
    title: "CFO, 200-person mid-market",
    style:
      "Numbers-only. Will drill into CAC payback, ROI model assumptions, and break you if the math is sloppy.",
    topObjections: [
      "'What's the ROI model and what are your assumptions?' — needs defensible math.",
      "'Our budget is locked for the year.' — push into next-year planning or contingency.",
      "'I've seen vendors promise these savings before and not deliver.' — skeptic.",
    ],
  },
  {
    key: "vp_sales",
    name: "Priya (VP Sales)",
    title: "VP Sales, global SaaS",
    style:
      "Bought a hundred tools. Will probe whether your solution will actually get adopted by her reps or just sit in procurement.",
    topObjections: [
      "'My reps already have 17 tools — why another?' — wants consolidation story.",
      "'Show me 3 customers my size that saw the numbers you're claiming.' — social proof.",
      "'What's the onboarding time before I see impact?' — time-to-value.",
    ],
  },
  {
    key: "founder",
    name: "Sam (Technical founder)",
    title: "Co-founder & CTO, seed stage",
    style:
      "Hands-on, wants depth fast. Respects technical honesty, allergic to buzzwords and marketing speak.",
    topObjections: [
      "'How does this actually work under the hood?' — architecture / security depth.",
      "'Do you have an API / webhook / export — can I leave if I need to?' — lock-in fear.",
      "'Can I just pay month-to-month?' — commitment-phobic.",
    ],
  },
  {
    key: "practitioner",
    name: "Alex (Senior RevOps manager)",
    title: "Sr. RevOps Manager, 500-person B2B",
    style:
      "The actual user. Wants to see exact workflow. Will champion if it fits, kill if it doesn't.",
    topObjections: [
      "'Walk me through what Monday morning looks like with this.' — workflow fit.",
      "'How does this work with Salesforce / HubSpot / our current stack?' — integration depth.",
      "'My boss will ask about price — what's it going to land at?' — help me sell internally.",
    ],
  },
];

const PRESETS: Record<Template, Partial<ScriptState>> = {
  discovery: {
    opener:
      "Hey {{first_name}} — thanks for the time. To make this useful, I want to understand where you are today and what 'solved' looks like.",
    agenda:
      "1. You: current state, what's working, what isn't\n2. Me: how we typically help teams in your situation\n3. Both: decide if a next step makes sense",
    qualifying:
      "• What triggered the search?\n• How are you solving this today?\n• Who else is involved in the decision?\n• What's the cost of not solving this in 90 days?\n• What does 'success' look like 6 months from now?",
    valueProps:
      "• Cut manual work by 40–60% on X workflow\n• One dashboard for {{decision_maker_role}} instead of 4 tabs\n• Typical time-to-value: 2 weeks, not 2 quarters",
    objections:
      "• Price → reframe to cost of status quo; split payment; annual with opt-out\n• Timing → propose parallel path: contract + 30-day onboarding kickoff in Q3\n• Authority → ask to co-author a memo for {{decision_maker_role}}",
    nextSteps:
      "If there's a fit: 30-min scoping call with {{stakeholder}}.\nIf unclear: I send a short memo by {{date}} with 3 questions you can share internally.",
  },
  demo: {
    opener:
      "Thanks for making time. Before I share my screen — quick check: any specific workflow or stakeholder I should prioritize showing?",
    agenda:
      "1. 60-second recap of what I heard last call\n2. Walk through the 3 scenarios that mattered most to you\n3. Pricing + path forward",
    qualifying:
      "• Who else should see this?\n• What would make you stop me and go 'yes, that's it'?\n• What's the deal-breaker if we're missing it?",
    valueProps:
      "Show, don't tell. Map each feature to a pain they named last call.",
    objections:
      "• 'Does it do X?' → demonstrate or be honest about roadmap\n• 'Is it secure?' → share one-pager, offer security review call",
    nextSteps:
      "Proposal by {{date}}. Group review with {{stakeholder}} the following week.",
  },
  objection: {
    opener:
      "I want to address the concern directly — not talk around it. Can you say more about what's behind it?",
    agenda:
      "1. Understand the real objection (not the surface one)\n2. Reframe or solve\n3. Commit to a next step",
    qualifying:
      "• Is this the only blocker?\n• If we solved X, would you move forward?\n• Who else shares this concern?",
    valueProps:
      "Re-anchor on the cost of doing nothing. Quantify the gap.",
    objections:
      "Price: 'Expensive compared to what?' → status quo, not a cheaper alternative\nTiming: offer phased deployment or delayed start\nCompetitor: acknowledge + differentiate on 1–2 dimensions that matter to them\nChampion left: ask for intro to replacement; re-run discovery in 30 minutes",
    nextSteps:
      "Commit to a specific, time-boxed action. Don't leave without a calendar invite.",
  },
  closing: {
    opener:
      "Last time we agreed to move forward pending {{remaining_blocker}}. I have an updated contract and a 14-day onboarding plan — want to walk through both?",
    agenda:
      "1. Contract review — 10 min\n2. Onboarding plan + kickoff date\n3. Introductions to CS and implementation",
    qualifying:
      "• Who needs to sign?\n• What's legal's turnaround?\n• Any last-minute approvers I should know about?",
    valueProps:
      "Reinforce the outcome metric, not the features. Remind them why they started.",
    objections:
      "Last-minute discount ask → hold the price; offer value-adds (extra training, priority support)\nPayment terms → net-30 standard; annual in advance for 10% off",
    nextSteps:
      "Signed contract by {{date}}. Kickoff call on {{kickoff_date}}.",
  },
  bant: {
    opener:
      "To make sure we use our time well, I'd like to confirm a few basics before going deeper. Cool if I ask four quick questions?",
    agenda:
      "1. Budget — is funding allocated or is this new-budget?\n2. Authority — who signs, who approves?\n3. Need — what's the quantified pain?\n4. Timeline — what's the buying window?",
    qualifying:
      "Budget:\n• Is there an allocated budget for this, or does it need new approval?\n• What's the expected investment range — $10k? $50k? $500k?\n\nAuthority:\n• Who's the economic buyer?\n• Who else signs off — procurement, legal, security?\n\nNeed:\n• What problem are you solving, in measurable terms?\n• What does the status quo cost you?\n\nTimeline:\n• When do you need to be live?\n• What happens if you miss that date?",
    valueProps:
      "Map each value prop to the specific BANT answer you got. Don't pitch features that don't connect to their budget, authority path, measurable need, or timeline.",
    objections:
      "• No budget → explore ROI payback; move to next fiscal planning cycle\n• No authority → ask to be introduced to the EB; co-author a memo\n• No acknowledged need → re-run discovery; you qualified too early\n• No timeline → often means no pain; disqualify or nurture",
    nextSteps:
      "If all 4 are 'yes': scope call + proposal.\nIf 2–3 are 'yes': gap-close next step for the weak dimension.\nIf 0–1: nurture, don't waste cycles.",
  },
  meddpicc: {
    opener:
      "Quick framing: I've worked enterprise deals long enough to know a 'yes' in this room doesn't mean a signed contract. I'd rather pressure-test early than get surprised in month three. Can I walk through a few things with you?",
    agenda:
      "1. Metrics — what number will moving forward change?\n2. Economic Buyer — access confirmed?\n3. Decision Criteria — explicit technical + business criteria\n4. Decision Process — map every step\n5. Paper Process — procurement, legal, security\n6. Identify Pain — quantified, cost of inaction\n7. Champion — internal advocate\n8. Competition — named, incl. 'do nothing'",
    qualifying:
      "Metrics: 'If this works, what number moves, and by how much?'\nEconomic Buyer: 'Who ultimately owns this budget? Can I meet them?'\nDecision Criteria: 'What are the must-haves vs nice-to-haves — in writing?'\nDecision Process: 'Walk me through every step from today to signed contract.'\nPaper Process: 'How long does your legal/procurement typically take?'\nIdentify Pain: 'What's the cost of not solving this in 90 days?'\nChampion: 'Who inside {{company}} will fight for this?'\nCompetition: 'What alternatives are you seriously considering — including doing nothing?'",
    valueProps:
      "Proof points that map to their Metrics. Exec references that match the Economic Buyer's level. Security/architecture depth that satisfies Paper Process reviewers.",
    objections:
      "Most MEDDPICC deals die on: Paper Process (procurement takes 6 weeks), Champion (they leave), Competition ('do nothing' wins). Have a mitigation for each before you forecast.",
    nextSteps:
      "Exit this call with: (a) scheduled meeting with the EB, (b) written decision criteria, (c) champion commitment to pressure-test internally. Do not forecast without all three.",
  },
  challenger: {
    opener:
      "Before we get into our product — I want to share something about {{segment}} companies that most don't see. Three trends that predict whether teams like yours will hit their number next year. Want me to walk you through what we've found?",
    agenda:
      "1. Teach — share the non-obvious insight\n2. Tailor — connect it to {{company}} specifically\n3. Take control — lead them to the reframe, and the action\n(Based on Dixon & Adamson, The Challenger Sale, 2011)",
    qualifying:
      "• 'When you look at peers who've grown from {{current_stage}} to {{next_stage}} — what did the winners do differently?'\n• 'Here's the part that surprised us: [counterintuitive finding]. Does that match your experience?'\n• 'If I'm right about that, what's the implication for {{company}}'s {{priority_area}} plan?'",
    valueProps:
      "Teach: data, benchmarks, pattern from working with 50+ {{segment}} teams.\nTailor: connect the insight to the specific person in the room and their P&L.\nTake control: 'The reason we can solve this for you is [unique capability].' Lead them — don't ask permission.",
    objections:
      "Challengers don't back down on price. 'Cheaper' alternatives are usually the wrong frame. Re-anchor on the insight and the cost of the wrong decision. If they push, repeat the teaching: 'The teams that got this right did X. The teams that got it wrong did Y. Which do you want to be?'",
    nextSteps:
      "Propose a specific action that requires mild commitment — a working session with their data, a memo for their exec team. Get a calendar invite in the next 60 minutes.",
  },
  spin: {
    opener:
      "I'd like to understand your situation before talking about anything we do. Walk me through how things work today — who, what, and the current setup.",
    agenda:
      "1. Situation — current facts & context\n2. Problem — what's broken or suboptimal\n3. Implication — cost, risk, knock-on effects\n4. Need-payoff — value of solving it\n(Based on Neil Rackham, SPIN Selling, 1988 — research on 35,000 sales calls)",
    qualifying:
      "Situation (keep short — you can find most of this online):\n• How is your team structured for this?\n• What systems do you currently use?\n• How long have things been this way?\n\nProblem:\n• Where does the current approach break down?\n• How often does {{pain_point}} happen?\n• Who's affected when it does?\n\nImplication:\n• What's the knock-on effect when {{pain_point}} happens?\n• What's it costing you in time / money / morale?\n• What happens if this continues through {{next_period}}?\n\nNeed-payoff:\n• If we could fix {{pain_point}}, what would that be worth?\n• How would that change {{metric}} for you?\n• Why does this matter to you personally?",
    valueProps:
      "SPIN teaches: let the buyer articulate the value. Don't pitch — ask better questions. Value props surface as their own answers to your need-payoff questions.",
    objections:
      "In SPIN, most objections come from selling too early. If you hit objections, you probably skipped Implication and Need-payoff. Rewind — re-earn permission to propose.",
    nextSteps:
      "Based on what they said in Need-payoff, propose the smallest thing that would validate the value. A pilot, a workshop, a data analysis — not a full purchase.",
  },
};

// Phase ribbons — visual mapping over the underlying ScriptState fields.
type PhaseKey = "open" | "discover" | "qualify" | "pitch" | "close";
const PHASES: {
  key: PhaseKey;
  label: string;
  field: keyof ScriptState;
  talkTrack: string;
  weight: number;
  glyph: string;
}[] = [
  {
    key: "open",
    label: "Open",
    field: "opener",
    talkTrack:
      "First 60 seconds. Earn the right to be there. Set the tone, name the agenda, ask permission.",
    weight: 10,
    glyph: "01",
  },
  {
    key: "discover",
    label: "Discover",
    field: "agenda",
    talkTrack:
      "Frame the conversation. Lay out what you'll cover so the buyer can redirect early — saves wasted minutes.",
    weight: 15,
    glyph: "02",
  },
  {
    key: "qualify",
    label: "Qualify",
    field: "qualifying",
    talkTrack:
      "Their voice, not yours. Open questions, then quiet. Listen for trigger, pain, authority, timeline.",
    weight: 35,
    glyph: "03",
  },
  {
    key: "pitch",
    label: "Pitch",
    field: "valueProps",
    talkTrack:
      "Map each value prop to a pain they just named. No feature list. Outcome → mechanism → proof.",
    weight: 25,
    glyph: "04",
  },
  {
    key: "close",
    label: "Close",
    field: "nextSteps",
    talkTrack:
      "Specific, time-boxed action with a calendar invite. Don't leave the meeting without a yes/no path.",
    weight: 15,
    glyph: "05",
  },
];

type ModeKey = "build" | "preview" | "practice";

function defaultState(): ScriptState {
  return {
    template: "discovery",
    company: "Acme Co",
    product: "Our platform",
    opener: PRESETS.discovery.opener || "",
    agenda: PRESETS.discovery.agenda || "",
    qualifying: PRESETS.discovery.qualifying || "",
    valueProps: PRESETS.discovery.valueProps || "",
    objections: PRESETS.discovery.objections || "",
    nextSteps: PRESETS.discovery.nextSteps || "",
  };
}

export default function SalesCallScriptBuilderPage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="Sales Call Script Builder"
      description="Structured call scripts for discovery, demo, objection, closing — plus BANT, MEDDPICC, Challenger Sale, and SPIN frameworks. Role-play partner with 5 buyer personas. Export as markdown."
    >
      <Inner />
    </ToolShell>
  );
}

function Inner() {
  const [state, setState] = useState<ScriptState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [rolePlayPersona, setRolePlayPersona] = useState<string>("");
  const [activePhase, setActivePhase] = useState<PhaseKey>("open");
  const [objectionsOpen, setObjectionsOpen] = useState(false);
  const [mode, setMode] = useState<ModeKey>("build");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw) as ScriptState);
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "build" || m === "preview" || m === "practice") setMode(m as ModeKey);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(MODE_LS_KEY, mode);
    } catch {}
  }, [state, mode, hydrated]);

  const loadTemplate = (t: Template) => {
    const p = PRESETS[t];
    setState((s) => ({
      ...s,
      template: t,
      opener: p.opener || s.opener,
      agenda: p.agenda || s.agenda,
      qualifying: p.qualifying || s.qualifying,
      valueProps: p.valueProps || s.valueProps,
      objections: p.objections || s.objections,
      nextSteps: p.nextSteps || s.nextSteps,
    }));
  };

  const markdown = useMemo(() => {
    const label =
      TEMPLATES.find((t) => t.key === state.template)?.label || state.template;
    return `# ${label} — ${state.company}

_Product: ${state.product}_

## Opener
${state.opener}

## Agenda
${state.agenda}

## Qualifying questions
${state.qualifying}

## Value props
${state.valueProps}

## Objection responses
${state.objections}

## Next steps
${state.nextSteps}
`;
  }, [state]);

  const copy = () => navigator.clipboard?.writeText(markdown);

  const download = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.template}-script.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activePersona = BUYER_PERSONAS.find((p) => p.key === rolePlayPersona);

  // Talk-time meter math
  const phaseDensity = useMemo(() => {
    return PHASES.map((p) => {
      const text = String(state[p.field] || "");
      const chars = text.trim().length;
      return { phase: p, chars, suggested: p.weight };
    });
  }, [state]);
  const totalChars = phaseDensity.reduce((acc, x) => acc + x.chars, 0) || 1;
  const totalSuggested =
    phaseDensity.reduce((acc, x) => acc + x.suggested, 0) || 1;

  const meterSegments = phaseDensity.map((x) => {
    const actualPct = (x.chars / totalChars) * 100;
    const suggestedPct = (x.suggested / totalSuggested) * 100;
    return {
      key: x.phase.key,
      label: x.phase.label,
      actualPct,
      suggestedPct,
      displayPct: x.chars === 0 ? suggestedPct : actualPct * 0.7 + suggestedPct * 0.3,
    };
  });
  const displayTotal = meterSegments.reduce((a, s) => a + s.displayPct, 0) || 1;
  meterSegments.forEach((s) => {
    s.displayPct = (s.displayPct / displayTotal) * 100;
  });

  const talkMinutes = Math.max(1, Math.round(totalChars / 900));

  const sampleLines: Record<PhaseKey, string[]> = {
    open: [
      "Thanks for the time — I'll keep us to the 25 minutes.",
      "Quick frame: I want this to be useful for you, not a pitch.",
      "Anything specific you want to make sure we cover before I propose an agenda?",
    ],
    discover: [
      "Here's what I had in mind — push back if it's wrong.",
      "First 10 minutes you, last 10 me, middle 5 we decide together.",
      "Any stakeholder I should keep top of mind for the agenda?",
    ],
    qualify: [
      "What triggered the search now versus six months ago?",
      "How are you solving this today, and where does it break?",
      "Who else inside {{company}} cares about this outcome?",
    ],
    pitch: [
      "Based on what you said about {{pain_point}} — three things matter.",
      "Here's how teams in your shape typically see week-by-week impact.",
      "I'd rather show you one proof than tell you three claims.",
    ],
    close: [
      "Two paths from here — let me lay both out and you pick.",
      "If we move, the next step is X by {{date}}. If not, here's what I'd do instead.",
      "Can we lock the calendar invite before we hang up?",
    ],
  };

  const objectionBranches = useMemo(() => {
    return state.objections
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const arrow = line.split(/→|->/);
        const colon = line.split(/:\s/);
        let trigger = `Branch ${i + 1}`;
        let response = line;
        if (arrow.length >= 2) {
          trigger = arrow[0].replace(/^[•\-\*]\s*/, "").trim();
          response = arrow.slice(1).join(" → ").trim();
        } else if (colon.length >= 2 && colon[0].length < 60) {
          trigger = colon[0].replace(/^[•\-\*]\s*/, "").trim();
          response = colon.slice(1).join(": ").trim();
        }
        return { id: i, trigger, response };
      });
  }, [state.objections]);

  // Derive a slug for the masthead breadcrumb
  const scriptSlug = useMemo(() => {
    const label =
      TEMPLATES.find((t) => t.key === state.template)?.label || state.template;
    return `${state.template}-${(state.company || "untitled")
      .toLowerCase()
      .replace(/\s+/g, "-")}.script`;
  }, [state.template, state.company]);

  // Variables seen in any phase content
  const variableChips = useMemo(() => {
    const all = `${state.opener} ${state.agenda} ${state.qualifying} ${state.valueProps} ${state.objections} ${state.nextSteps}`;
    const set = new Set<string>();
    const re = /\{\{([a-z_]+)\}\}/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(all)) !== null) {
      set.add(m[1]);
    }
    return Array.from(set).slice(0, 8);
  }, [state]);

  const phase = PHASES.find((p) => p.key === activePhase) || PHASES[0];
  const phaseFieldKey = phase.field;
  const frameworkLabel =
    TEMPLATES.find((t) => t.key === state.template)?.label || state.template;

  return (
    <div data-tool-theme="sales" data-tool="sales-call-script-builder">
      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        {/* console chrome */}
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
            {frameworkLabel}
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            ~{talkMinutes}m talk
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            sales.script
            <span className="text-faint">/</span>
            <span className="text-secondary">{scriptSlug}</span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {hydrated ? "◉ autosaved" : ""}
          </div>
        </div>

        <div className="relative p-5">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                Sales call script · 5-phase playbook
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  5 phases
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {objectionBranches.length} objection{objectionBranches.length === 1 ? "" : "s"}
                </span>
                {variableChips.length > 0 && (
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {variableChips.length} var{variableChips.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              <div className="mt-3">
                <input
                  value={state.company}
                  onChange={(e) => setState({ ...state, company: e.target.value })}
                  placeholder="Acme Co"
                  className="w-full bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-faint outline-none md:text-3xl"
                />
                <input
                  value={state.product}
                  onChange={(e) => setState({ ...state, product: e.target.value })}
                  placeholder="Our platform"
                  className="mt-1 w-full bg-transparent font-mono text-xs text-secondary placeholder:text-faint outline-none"
                />
              </div>
            </div>

            {/* talk-time dial */}
            <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
              <div className="relative h-12 w-12">
                <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="var(--tool-accent)"
                    strokeWidth="3"
                    strokeDasharray={`${Math.min(100, (totalChars / 4500) * 100)}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                  {talkMinutes}m
                </div>
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Estimated talk
                </div>
                <div className="text-sm font-semibold text-app">
                  {totalChars} chars
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* sub-tab strip */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "build", label: "Build" },
                { k: "preview", label: "Preview" },
                { k: "practice", label: "Practice" },
              ] as { k: ModeKey; label: string }[]
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setMode(t.k)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  mode === t.k
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            onChange={(e) => {
              if (e.target.value) loadTemplate(e.target.value as Template);
              e.target.value = "";
            }}
            className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
            defaultValue=""
          >
            <option value="" disabled>
              Load preset…
            </option>
            {TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
                {t.source ? ` — ${t.source}` : ""}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={copy}
              className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
            >
              Copy
            </button>
            <button
              onClick={download}
              className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              Export .md
            </button>
          </div>
        </div>
      </section>

      {/* Talk-time meter */}
      <div className="mb-5 rounded-xl border border-app bg-app-elevated p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
              Talk-time meter
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-app">
                ~{talkMinutes}
              </span>
              <span className="text-xs text-secondary">
                min spoken · phase distribution below
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-tool-accent" />
              Active
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-tool-accent-soft" />
              Other phases
            </span>
          </div>
        </div>

        <div className="flex h-3 w-full overflow-hidden rounded-full border border-app bg-app">
          {meterSegments.map((seg) => (
            <button
              key={seg.key}
              type="button"
              onClick={() => setActivePhase(seg.key as PhaseKey)}
              title={`${seg.label} · ${seg.displayPct.toFixed(0)}%`}
              style={{ width: `${seg.displayPct}%` }}
              className={`h-full transition-opacity hover:opacity-80 ${
                activePhase === seg.key
                  ? "bg-tool-accent"
                  : "bg-tool-accent-soft"
              }`}
            />
          ))}
        </div>

        <div className="mt-2 grid grid-cols-5 gap-1 font-mono text-[0.5rem] uppercase tracking-[0.15em] text-muted">
          {meterSegments.map((seg) => (
            <div key={seg.key} className="text-center">
              <div className="truncate">{seg.label}</div>
              <div className="text-faint">{seg.displayPct.toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stat strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Framework" value={frameworkLabel} accent />
        <Stat label="Company" value={state.company || "—"} />
        <Stat label="Product" value={state.product || "—"} />
        <Stat label="Phases" value="5" />
      </div>

      {/* Variable chips */}
      {variableChips.length > 0 && (
        <div className="mb-5 rounded-xl border border-app bg-app-elevated p-4">
          <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
            Variables in script
          </div>
          <div className="flex flex-wrap gap-1.5">
            {variableChips.map((v) => (
              <span
                key={v}
                className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] text-tool-accent"
              >
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* PREVIEW MODE */}
      {mode === "preview" && (
        <div className="mt-2">
          <ToolCard title="Markdown preview" subtitle="Ready to copy">
            <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-lg border border-app bg-app p-4 font-mono text-xs text-app">
              {markdown}
            </pre>
          </ToolCard>
        </div>
      )}

      {/* PRACTICE MODE — role-play view */}
      {mode === "practice" && (
        <div className="space-y-5">
          <ToolCard
            title="Role-play partner"
            subtitle="Pick a buyer persona to rehearse against"
          >
            <div className="mb-4 flex flex-wrap gap-2">
              {BUYER_PERSONAS.map((p) => (
                <button
                  key={p.key}
                  onClick={() =>
                    setRolePlayPersona((cur) => (cur === p.key ? "" : p.key))
                  }
                  className={`rounded-lg border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                    rolePlayPersona === p.key
                      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border-app bg-app-elevated text-secondary hover:text-app"
                  }`}
                >
                  {p.name.split(" ")[0]}
                </button>
              ))}
            </div>
            {activePersona ? (
              <div className="space-y-4 rounded-xl border border-app bg-app-elevated p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-sm font-semibold text-tool-accent">
                    {activePersona.name
                      .replace(/\(.*\)/, "")
                      .trim()
                      .split(/\s+/)
                      .map((s) => s[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                      {activePersona.name}
                    </div>
                    <div className="text-sm font-semibold text-app">
                      {activePersona.title}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    Style
                  </div>
                  <p className="text-sm text-secondary">{activePersona.style}</p>
                </div>
                <div>
                  <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    Their top objections
                  </div>
                  <ul className="space-y-2">
                    {activePersona.topObjections.map((o, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-app bg-app p-3 font-mono text-xs leading-relaxed text-secondary"
                      >
                        <span className="mr-2 text-tool-accent">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3 text-xs text-app">
                  Practice: read your opener aloud as if speaking to this persona.
                  Then answer each objection in under 60 seconds without
                  defensiveness.
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-app bg-app p-8 text-center text-sm text-muted">
                Pick a persona to see their style + most common objections.
              </div>
            )}
          </ToolCard>

          {/* Mock dialogue view — your opener vs persona response */}
          {activePersona && (
            <ToolCard title="Mock dialogue" subtitle="Your opener · their pushback">
              <div className="space-y-3">
                <div className="rounded-lg border border-app bg-app p-3">
                  <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    You
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-app">
                    {state.opener || "(write your opener in Build mode)"}
                  </pre>
                </div>
                <div className="rounded-lg border border-app bg-app-elevated p-3">
                  <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    {activePersona.name}
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-secondary">
                    {activePersona.topObjections[0] || ""}
                  </pre>
                </div>
              </div>
            </ToolCard>
          )}
        </div>
      )}

      {/* BUILD MODE */}
      {mode === "build" && (
        <>
          {/* Framework presets */}
          <div className="mb-3 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
            Classic scripts
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {TEMPLATES.filter((t) =>
              ["discovery", "demo", "objection", "closing"].includes(t.key)
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => loadTemplate(t.key)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                  state.template === t.key
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app bg-app-elevated text-secondary hover:text-app"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mb-3 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
            Sales framework presets
          </div>
          <div className="mb-6 flex flex-wrap gap-2">
            {TEMPLATES.filter((t) =>
              ["bant", "meddpicc", "challenger", "spin"].includes(t.key)
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => loadTemplate(t.key)}
                title={t.source}
                className={`rounded-lg border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                  state.template === t.key
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app bg-app-elevated text-secondary hover:text-app"
                }`}
              >
                {t.label}
                {t.source && (
                  <span className="ml-2 font-mono text-[0.5rem] text-faint">
                    · {t.source}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
            {/* Editor + phase ribbons */}
            <div className="space-y-5">
              {/* Phase ribbons */}
              <div className="rounded-xl border border-app bg-app-elevated p-2">
                <div className="grid grid-cols-5 gap-1">
                  {PHASES.map((p) => {
                    const isActive = activePhase === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setActivePhase(p.key)}
                        className={`group relative overflow-hidden rounded-lg border px-2 py-2.5 text-left transition-all ${
                          isActive
                            ? "border-tool-accent bg-tool-accent-soft"
                            : "border-app bg-app hover:border-tool-accent"
                        }`}
                      >
                        <div
                          className={`font-mono text-[0.55rem] tracking-[0.2em] ${
                            isActive ? "text-tool-accent" : "text-faint"
                          }`}
                        >
                          {p.glyph}
                        </div>
                        <div
                          className={`mt-0.5 text-xs font-semibold tracking-tight ${
                            isActive ? "text-app" : "text-secondary"
                          }`}
                        >
                          {p.label}
                        </div>
                        {isActive && (
                          <span className="pointer-events-none absolute inset-x-2 bottom-0 h-px bg-tool-accent" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Setup — company / product */}
              <ToolCard title="Account" subtitle="Setup">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Company">
                    <input
                      value={state.company}
                      onChange={(e) =>
                        setState({ ...state, company: e.target.value })
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Product">
                    <input
                      value={state.product}
                      onChange={(e) =>
                        setState({ ...state, product: e.target.value })
                      }
                      className={inputCls()}
                    />
                  </Field>
                </div>
              </ToolCard>

              {/* Active phase card */}
              <ToolCard
                title={`${phase.label} phase`}
                subtitle={`Phase ${phase.glyph} of 05`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    {phase.label}
                  </span>
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    {String(state[phaseFieldKey] || "").length} chars
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Talk-track */}
                  <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                      Talk-track
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-app">
                      {phase.talkTrack}
                    </p>
                  </div>

                  {/* Sample lines */}
                  <div>
                    <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary">
                      Sample lines
                    </div>
                    <ul className="space-y-1.5">
                      {sampleLines[phase.key].map((line, i) => (
                        <li
                          key={i}
                          className="rounded-lg border border-app bg-app px-3 py-2 font-mono text-xs leading-relaxed text-secondary"
                        >
                          <span className="mr-2 text-tool-accent">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Editor for this phase */}
                  <div>
                    <div className="mb-2 flex items-baseline justify-between">
                      <label className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary">
                        Your {phase.label.toLowerCase()} script
                      </label>
                      <span className="font-mono text-[0.55rem] text-faint">
                        {String(state[phaseFieldKey] || "").length} chars
                      </span>
                    </div>
                    <textarea
                      value={String(state[phaseFieldKey] || "")}
                      onChange={(e) =>
                        setState(
                          (s) =>
                            ({
                              ...s,
                              [phaseFieldKey]: e.target.value,
                            } as ScriptState)
                        )
                      }
                      className={inputCls("min-h-[140px] font-mono text-xs")}
                    />
                  </div>
                </div>
              </ToolCard>

              {/* Objection branches — collapsible drawers */}
              <ToolCard
                title="Objection branches"
                subtitle="If they push back · drawers"
              >
                <button
                  type="button"
                  onClick={() => setObjectionsOpen((o) => !o)}
                  className="mb-3 flex w-full items-center justify-between rounded-lg border border-app bg-app px-3 py-2 text-left transition-colors hover:border-tool-accent"
                >
                  <span className="text-xs font-medium text-app">
                    {objectionBranches.length} branch
                    {objectionBranches.length === 1 ? "" : "es"}
                  </span>
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                    {objectionsOpen ? "Collapse all" : "Expand all"}
                  </span>
                </button>

                {objectionBranches.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-app bg-app p-4 text-center text-xs text-muted">
                    No objection branches yet — load a preset or write some below.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {objectionBranches.map((b) => (
                      <ObjectionDrawer
                        key={b.id}
                        trigger={b.trigger}
                        response={b.response}
                        forceOpen={objectionsOpen}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <label className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary">
                      Edit branches
                    </label>
                    <span className="font-mono text-[0.55rem] text-faint">
                      one per line · use → or :
                    </span>
                  </div>
                  <textarea
                    value={state.objections}
                    onChange={(e) =>
                      setState((s) => ({ ...s, objections: e.target.value }))
                    }
                    className={inputCls("min-h-[120px] font-mono text-xs")}
                  />
                </div>
              </ToolCard>
            </div>

            {/* Sidebar — export + role-play */}
            <div className="space-y-6">
              <ToolCard title="Export" subtitle="Markdown">
                <div className="mb-3 flex gap-2">
                  <button
                    onClick={copy}
                    className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition-opacity hover:opacity-80"
                  >
                    Copy
                  </button>
                  <button
                    onClick={download}
                    className="rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                  >
                    Download .md
                  </button>
                </div>
                <pre className="max-h-[360px] overflow-auto rounded-lg border border-app bg-app p-4 font-mono text-xs text-secondary">
                  {markdown}
                </pre>
              </ToolCard>

              <ToolCard
                title="Role-play partner"
                subtitle="Rehearse with a buyer persona"
              >
                <div className="mb-3 flex flex-wrap gap-2">
                  {BUYER_PERSONAS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() =>
                        setRolePlayPersona((cur) => (cur === p.key ? "" : p.key))
                      }
                      className={`rounded-lg border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                        rolePlayPersona === p.key
                          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-app-elevated text-secondary hover:text-app"
                      }`}
                    >
                      {p.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
                {activePersona ? (
                  <div className="space-y-3 text-sm text-secondary">
                    <div>
                      <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                        {activePersona.name}
                      </div>
                      <div className="text-xs text-muted">
                        {activePersona.title}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                        Style
                      </div>
                      <p className="text-sm">{activePersona.style}</p>
                    </div>
                    <div>
                      <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                        Their top objections
                      </div>
                      <ul className="space-y-1 text-sm text-secondary">
                        {activePersona.topObjections.map((o, i) => (
                          <li
                            key={i}
                            className="rounded-lg border border-app bg-app p-2"
                          >
                            {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3 text-xs text-app">
                      Practice: read your opener aloud as if speaking to this
                      persona. Then answer each objection in under 60 seconds
                      without defensiveness.
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center text-sm text-muted">
                    Pick a persona to see their style + most common objections.
                  </div>
                )}
              </ToolCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ObjectionDrawer({
  trigger,
  response,
  forceOpen,
}: {
  trigger: string;
  response: string;
  forceOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  return (
    <div className="overflow-hidden rounded-lg border border-app bg-app">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-tool-accent-soft"
      >
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full transition-colors ${
              isOpen ? "bg-tool-accent" : "bg-tool-accent-soft"
            }`}
          />
          <span className="text-xs font-medium text-app">{trigger}</span>
        </span>
        <span className="font-mono text-[0.55rem] text-tool-accent">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen && (
        <div className="border-t border-app bg-app-elevated px-3 py-2.5">
          <div className="mb-1 font-mono text-[0.5rem] uppercase tracking-[0.18em] text-tool-accent">
            Response
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-secondary">
            {response}
          </p>
        </div>
      )}
    </div>
  );
}
