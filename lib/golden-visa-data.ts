export interface VisaCategory {
  id: string;
  name: string;
  duration: string;
  minPropertyValue: number;
  propertyStatus: ("completed" | "off-plan" | "both")[];
  mortgageAllowed: boolean;
  mortgageNote: string;
  multipleProperties: boolean;
  dependentsIncluded: boolean;
  dependentsNote: string;
  renewalProcess: string;
  processingTime: string;
  governmentFees: string;
  requiredDocuments: string[];
  keyBenefits: string[];
  restrictions: string[];
  description: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export const visaCategories: VisaCategory[] = [
  {
    id: "golden-visa-10yr",
    name: "10-Year Golden Visa (Property Investor)",
    duration: "10 years",
    minPropertyValue: 2_000_000,
    propertyStatus: ["completed", "off-plan", "both"],
    mortgageAllowed: true,
    mortgageNote:
      "Mortgaged properties are accepted provided the mortgage is from a UAE-approved bank. The full property purchase price (not the equity portion) counts toward the AED 2M threshold. No minimum equity percentage is required since the 2023 rule update.",
    multipleProperties: true,
    dependentsIncluded: true,
    dependentsNote:
      "Spouse, children of any age, and one executive assistant/domestic helper can be sponsored. Children over 25 previously needed separate sponsorship but recent updates allow inclusion under the family umbrella.",
    renewalProcess:
      "Renewable for another 10 years provided you still own qualifying property worth AED 2M+ at the time of renewal. Property can be different from the original.",
    processingTime: "5–30 business days via ICP Smart Services or GDRFA",
    governmentFees:
      "Residence visa: AED 2,830 | Emirates ID: AED 570 | Medical fitness: AED 320 | Entry permit (if outside UAE): AED 1,150 | Total approx: AED 4,870–5,500 per person (typing fees vary)",
    requiredDocuments: [
      "Valid passport (minimum 6 months validity)",
      "Title deed(s) from Dubai Land Department",
      "Property valuation letter (if off-plan, from developer)",
      "Bank mortgage letter (if mortgaged)",
      "Passport-size photos (white background)",
      "Current UAE visa copy (if already a resident)",
      "Medical fitness test results",
      "Emirates ID application",
      "Health insurance (valid UAE coverage)",
      "Proof of property ownership (Oqood for off-plan)",
    ],
    keyBenefits: [
      "10-year residency renewable indefinitely",
      "No sponsor or employer required",
      "Stay outside UAE for any duration without losing residency",
      "Sponsor your entire family including parents (separate application)",
      "100% business ownership in mainland UAE",
      "Priority services at government offices",
      "Easier bank account opening and credit access",
      "Long-term stability for children's schooling",
    ],
    restrictions: [
      "Property must be in the investor's name (not a company)",
      "Off-plan properties must be from government-approved developers registered with RERA",
      "Property under dispute or encumbrance may delay approval",
      "Criminal record check may be conducted",
    ],
    description:
      "The flagship UAE Golden Visa for property investors. Requires owning one or more properties with a combined value of at least AED 2,000,000. This is the most popular route for real estate investors in Dubai, offering long-term residency without the need for a local sponsor.",
  },
  {
    id: "retirement-visa-5yr",
    name: "5-Year Retirement Visa",
    duration: "5 years",
    minPropertyValue: 1_000_000,
    propertyStatus: ["completed"],
    mortgageAllowed: false,
    mortgageNote:
      "Property must be fully paid off — no outstanding mortgage allowed. The property must be in the applicant's name and unencumbered.",
    multipleProperties: true,
    dependentsIncluded: true,
    dependentsNote:
      "Spouse can be sponsored. Children may be included if they are dependents (typically under 18 or enrolled in education).",
    renewalProcess:
      "Renewable for another 5 years if eligibility conditions (age, property ownership, and financial requirements) are still met.",
    processingTime: "10–30 business days via GDRFA",
    governmentFees:
      "Residence visa: AED 2,830 | Emirates ID: AED 570 | Medical fitness: AED 320 | Entry permit (if outside UAE): AED 1,150 | Total approx: AED 4,870–5,500 per person",
    requiredDocuments: [
      "Valid passport (minimum 6 months validity)",
      "Proof of age (55 years or older)",
      "Title deed(s) — property fully paid, no mortgage",
      "Bank statement showing savings of AED 1M+ OR proof of monthly income of AED 20,000+",
      "Passport-size photos (white background)",
      "Medical fitness test results",
      "Emirates ID application",
      "Health insurance (valid UAE coverage)",
      "No-objection certificate from current sponsor (if applicable)",
    ],
    keyBenefits: [
      "5-year residency visa (renewable)",
      "No sponsor or employer required",
      "Can stay outside UAE for up to 6 months at a time",
      "Sponsor your spouse",
      "Access to UAE banking and financial services",
      "Peaceful retirement in a tax-free environment",
    ],
    restrictions: [
      "Applicant must be 55 years of age or older",
      "Property must be completed (not off-plan or under construction)",
      "Property must be fully owned — no mortgage",
      "Must also meet one financial requirement: property worth AED 1M+, OR savings of AED 1M+, OR monthly income of AED 20,000+",
      "Cannot work on this visa (separate work permit needed)",
    ],
    description:
      "A 5-year renewable visa for retirees aged 55 and above. Requires a fully paid property worth at least AED 1,000,000 (or equivalent savings/income). Ideal for those looking to retire in the UAE with the security of property ownership.",
  },
  {
    id: "golden-visa-5yr-offplan",
    name: "5-Year Golden Visa (Off-Plan Property)",
    duration: "5 years",
    minPropertyValue: 2_000_000,
    propertyStatus: ["off-plan"],
    mortgageAllowed: true,
    mortgageNote:
      "Mortgage from a UAE-approved bank is accepted. The full purchase value counts toward the AED 2M threshold.",
    multipleProperties: true,
    dependentsIncluded: true,
    dependentsNote:
      "Spouse and children can be sponsored similar to the 10-year Golden Visa.",
    renewalProcess:
      "Initially issued for 5 years. Can be upgraded to a 10-year Golden Visa once the property is completed and handed over, provided the value still meets the AED 2M threshold.",
    processingTime: "5–30 business days via ICP or GDRFA",
    governmentFees:
      "Residence visa: AED 2,830 | Emirates ID: AED 570 | Medical fitness: AED 320 | Entry permit: AED 1,150 | Total approx: AED 4,870–5,500 per person",
    requiredDocuments: [
      "Valid passport (minimum 6 months validity)",
      "Oqood (initial sale contract registered with DLD)",
      "Sales and Purchase Agreement (SPA)",
      "Developer letter confirming purchase and payment plan",
      "Bank mortgage letter (if financed)",
      "Passport-size photos (white background)",
      "Medical fitness test results",
      "Emirates ID application",
      "Health insurance (valid UAE coverage)",
    ],
    keyBenefits: [
      "Secure residency before your property is completed",
      "5-year visa upgradeable to 10 years upon handover",
      "No need to wait for project completion",
      "Same family sponsorship benefits",
      "Full ownership rights maintained",
    ],
    restrictions: [
      "Developer must be registered with RERA and approved by DLD",
      "Off-plan project must be from a government-approved developer",
      "Oqood registration is mandatory",
      "Property value based on purchase price in SPA (not current market value if lower)",
      "Some developers facilitate the visa process; check with your developer",
    ],
    description:
      "For investors who purchase off-plan properties worth AED 2M+ from approved developers. Initially grants a 5-year visa that can be upgraded to 10 years once the property is handed over. A great option if you're buying early in a new development.",
  },
];

export const faqs: FAQ[] = [
  {
    question: "Can I combine multiple properties to reach the AED 2M threshold?",
    answer:
      "Yes. You can aggregate the value of multiple properties to meet the AED 2,000,000 minimum for the 10-year Golden Visa. All properties must be in your name and registered with the Dubai Land Department. For example, two apartments worth AED 1.2M and AED 900K would total AED 2.1M and qualify.",
  },
  {
    question: "Does the property value refer to the purchase price or current market value?",
    answer:
      "For the Golden Visa application, the property value is based on the purchase price stated in the title deed or SPA. If the property has appreciated, you would typically use the original purchase price. However, a property valuation can sometimes be obtained if the current market value is higher — consult GDRFA for your specific case.",
  },
  {
    question: "Can I get a Golden Visa if my property has a mortgage?",
    answer:
      "Yes. Since the 2023 rule update, mortgaged properties qualify for the 10-year Golden Visa. The full purchase price counts toward the AED 2M threshold, regardless of how much equity you've paid. The mortgage must be from a UAE-approved bank. However, for the 5-year Retirement Visa, the property must be fully paid off with no outstanding mortgage.",
  },
  {
    question: "Can I apply for a Golden Visa with an off-plan property?",
    answer:
      "Yes, but with conditions. The off-plan property must be worth AED 2M+ and purchased from a RERA-registered, government-approved developer. You'll initially receive a 5-year visa based on the Oqood (initial registration). Once the property is completed and the title deed is issued, you can upgrade to a 10-year Golden Visa.",
  },
  {
    question: "How long can I stay outside the UAE with a Golden Visa?",
    answer:
      "With the 10-year Golden Visa, there is no maximum period you must spend inside the UAE — you can stay abroad indefinitely without losing your residency. This is a major advantage over regular residency visas, which require entry every 180 days. The 5-year Retirement Visa has a 6-month maximum absence rule.",
  },
  {
    question: "Can I sponsor my family members with a Golden Visa?",
    answer:
      "Yes. Golden Visa holders can sponsor their spouse, children (of any age under the latest updates), and one domestic helper or executive assistant. Parents can also be sponsored through a separate application. Each dependent requires their own medical fitness test, Emirates ID, and health insurance.",
  },
  {
    question: "What are the total costs for a Golden Visa application?",
    answer:
      "Government fees total approximately AED 4,870–5,500 per person, covering the residence visa fee, Emirates ID, medical fitness, and entry permit. Additional costs include typing center fees (AED 200–500), health insurance (varies widely), and property valuation if needed. Budget around AED 6,000–8,000 per person all-in.",
  },
  {
    question: "Can I work in the UAE with a Golden Visa?",
    answer:
      "Yes. The 10-year Golden Visa allows you to work, establish businesses, and engage in commercial activities in the UAE without a separate work permit or NOC. You have 100% business ownership rights in mainland UAE. Note: the 5-year Retirement Visa does not include work authorization — a separate permit is needed.",
  },
  {
    question: "What happens if I sell my property after getting the Golden Visa?",
    answer:
      "If you sell the qualifying property, your Golden Visa remains valid until its expiry date. However, at renewal time, you'll need to demonstrate that you still own property worth AED 2M+ (or meet other qualifying criteria). It's advisable to purchase replacement property before selling if you want seamless renewal.",
  },
  {
    question: "Is the Golden Visa the same as UAE citizenship?",
    answer:
      "No. The Golden Visa is a long-term residency visa, not citizenship. It does not grant UAE nationality, a UAE passport, or voting rights. However, it provides most practical benefits of residency including banking, business ownership, and family sponsorship. UAE citizenship through naturalization is a separate, invitation-only process.",
  },
  {
    question: "Can property owned jointly (e.g., husband and wife) qualify?",
    answer:
      "Joint ownership can be complicated. If a property is jointly owned, each owner's share counts toward their individual threshold. For example, a AED 3M property owned 50/50 means each person has AED 1.5M — not enough individually for the Golden Visa (AED 2M minimum). Consider structuring ownership accordingly.",
  },
  {
    question: "Do I need to be in the UAE to apply for a Golden Visa?",
    answer:
      "You can initiate the application online through the ICP Smart Services portal or GDRFA website. However, you will need to be in the UAE for the medical fitness test and Emirates ID biometrics. Some applicants enter on a tourist visa, complete these steps, and receive their Golden Visa while in the country.",
  },
  {
    question: "How long does the Golden Visa process take?",
    answer:
      "Processing typically takes 5–30 business days from submission of a complete application. Simple cases with clear documentation (single completed property, no mortgage) are often approved within a week. Complex cases involving multiple properties, off-plan Oqood, or mortgaged properties may take longer.",
  },
  {
    question: "Are there any properties that don't qualify for the Golden Visa?",
    answer:
      "Properties under legal dispute, properties not registered with DLD, commercial properties (in some cases), and properties owned through a company rather than in your personal name may not qualify. Off-plan properties from non-RERA-registered developers are also excluded. Always verify eligibility with GDRFA before applying.",
  },
];

export const DATA_UPDATED = "March 2026";
