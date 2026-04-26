// 8 real comp-plan templates covering the most common B2B SaaS structures.
// Sources: Winning by Design Operating Handbook (2024), Alexander Group 2024 SaaS
// Comp Benchmarks, SalesHacker compensation surveys (public).

export interface CompPlanTemplate {
  key: string;
  name: string;
  role: string;
  description: string;
  baseSalary: number; // annual USD, US blended median
  variable: number; // OTE - base (at 100% attainment)
  accelerators: string; // description of accelerator structure
  clawbackRule: string;
  defaultDealRate: number; // % commission per deal for use in the tool
  source: string;
}

export const COMP_PLAN_TEMPLATES: CompPlanTemplate[] = [
  {
    key: "saas_ae_base_variable",
    name: "SaaS AE — 50/50 base + variable",
    role: "Account Executive",
    description:
      "Classic SaaS AE plan: 50% base, 50% variable at 100% quota. Commission rate of 10% on new ARR up to quota, 15% above.",
    baseSalary: 90000,
    variable: 90000,
    accelerators: "10% on new ARR to quota; 15% 100–150% attainment; 20% above 150%.",
    clawbackRule: "Full clawback if deal churns within 6 months; pro-rata 7–12 months.",
    defaultDealRate: 10,
    source: "Alexander Group 2024 SaaS Comp Benchmarks",
  },
  {
    key: "enterprise_hunter",
    name: "Enterprise hunter — low base, high leverage",
    role: "Enterprise AE (new logo)",
    description:
      "Hunter role — lower base, higher variable. Commission 8% base, aggressive accelerators. Deals typically $100k+.",
    baseSalary: 110000,
    variable: 165000,
    accelerators: "8% to quota; 12% 100–125%; 18% 125–175%; 25% above 175%.",
    clawbackRule: "Clawback if deal churns within 12 months.",
    defaultDealRate: 8,
    source: "Alexander Group 2024 SaaS Comp Benchmarks",
  },
  {
    key: "farmer_ae",
    name: "Farmer AE — expansion + renewal",
    role: "Account Manager / Farmer",
    description:
      "Rate split: 12% on net-new expansion ARR, 4% on renewal ARR. Lower OTE than hunter, higher base.",
    baseSalary: 100000,
    variable: 80000,
    accelerators: "No accelerators on renewals. Expansion: 12% to 100%; 18% above.",
    clawbackRule: "No clawback on renewals. Expansion clawback if churned in 6 months.",
    defaultDealRate: 8,
    source: "Winning by Design Operating Handbook",
  },
  {
    key: "bdr_meetings_based",
    name: "BDR — meetings-based",
    role: "Business Development Rep",
    description:
      "Flat bonus per Sales Accepted Meeting + small % of closed-won. Typical: $100/SAM, 1% on closed revenue sourced.",
    baseSalary: 55000,
    variable: 20000,
    accelerators: "$100 per SAM; $1k bonus per closed-won sourced > $50k.",
    clawbackRule: "Zero-out SAM bonus if meeting disqualifies in 7 days.",
    defaultDealRate: 1,
    source: "SalesHacker BDR Comp Survey 2024",
  },
  {
    key: "cs_renewal_tied",
    name: "CS — renewal-tied",
    role: "Customer Success Manager",
    description:
      "Retention-focused: 70% base, 30% variable tied to gross renewal rate + NRR. Commission rarely per-deal.",
    baseSalary: 85000,
    variable: 35000,
    accelerators:
      "Full variable at 95% GRR + 110% NRR. Kickers for exceeding targets.",
    clawbackRule: "No individual-deal clawbacks. Portfolio-level true-up quarterly.",
    defaultDealRate: 3,
    source: "Gainsight Customer Success Benchmarks 2024",
  },
  {
    key: "channel_partner_manager",
    name: "Channel — partner manager",
    role: "Channel / Partner Manager",
    description:
      "Driven by partner-sourced revenue. Typically 3–6% of partner-sourced ACV, plus MBO bonuses.",
    baseSalary: 120000,
    variable: 80000,
    accelerators: "5% on partner-sourced ACV; +$10k MBO bonus per certified new partner.",
    clawbackRule: "Clawback if partner-sourced deal churns within 6 months.",
    defaultDealRate: 5,
    source: "Alexander Group Channel Comp Study 2024",
  },
  {
    key: "partner_referral_fee",
    name: "Partner — referral-fee structure",
    role: "Referral Partner",
    description:
      "Flat referral fee for closed-won deals sourced by partner. Typical: 10–20% of first-year revenue.",
    baseSalary: 0,
    variable: 0,
    accelerators: "15% of first-year ARR for closed-won referrals; paid on collected cash.",
    clawbackRule: "Pro-rata clawback if deal churns within 12 months.",
    defaultDealRate: 15,
    source: "Public Partner Program Benchmarks",
  },
  {
    key: "mdf_tied_channel",
    name: "Channel — MDF-tied activation",
    role: "Channel Activation Manager",
    description:
      "Comp tied to partner activity: MDF deployment, certifications, co-sell opportunities. Smaller per-deal component.",
    baseSalary: 105000,
    variable: 45000,
    accelerators:
      "$5k per certified SE on partner team; 2% of MDF-sourced closed-won; MBO on partner satisfaction score.",
    clawbackRule: "No clawback on certifications. MDF clawback if partner exits program.",
    defaultDealRate: 2,
    source: "Alexander Group Channel Comp Study 2024",
  },
];

/**
 * US federal tax withholding on supplemental wages (commission, bonus).
 * IRS rules: 22% flat on supplemental up to $1M/year.
 * State withholding varies wildly — we use 5% as a rough national median.
 * This is NOT tax advice — rep should check state/local rules.
 */
export const DEFAULT_FEDERAL_SUPPLEMENTAL_RATE = 22; // %
export const DEFAULT_STATE_SUPPLEMENTAL_RATE = 5; // %, rough median across states
export const DEFAULT_FICA_RATE = 7.65; // % (Social Security 6.2 + Medicare 1.45)

export function estimateWithholding(
  gross: number,
  federalPct = DEFAULT_FEDERAL_SUPPLEMENTAL_RATE,
  statePct = DEFAULT_STATE_SUPPLEMENTAL_RATE,
  ficaPct = DEFAULT_FICA_RATE
): { federal: number; state: number; fica: number; totalWithheld: number; net: number } {
  const federal = (gross * federalPct) / 100;
  const state = (gross * statePct) / 100;
  const fica = (gross * ficaPct) / 100;
  const totalWithheld = federal + state + fica;
  return { federal, state, fica, totalWithheld, net: gross - totalWithheld };
}
