// 10 industry-standard lead-capture form templates.
// Sources: HubSpot Form Benchmarks 2024, Unbounce Conversion Benchmark Report.

export type FieldType = "text" | "email" | "phone" | "select" | "checkbox" | "textarea";

export interface PresetField {
  type: FieldType;
  label: string;
  name: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  showIf?: { name: string; equals: string };
  step?: number; // for multi-step forms
}

export interface FormPreset {
  key: string;
  name: string;
  description: string;
  submitLabel: string;
  action: string;
  multiStep?: boolean;
  fields: PresetField[];
  source: string;
}

export const FORM_PRESETS: FormPreset[] = [
  {
    key: "consultation",
    name: "Book a consultation",
    description: "High-intent consultation booking. Qualifies for budget + timeline.",
    submitLabel: "Book my consultation",
    action: "https://your-endpoint.example.com/consultations",
    multiStep: true,
    source: "HubSpot Form Benchmarks 2024",
    fields: [
      { type: "text", label: "Full name", name: "name", required: true, step: 1 },
      { type: "email", label: "Work email", name: "email", required: true, step: 1 },
      { type: "text", label: "Company", name: "company", required: true, step: 1 },
      {
        type: "select",
        label: "Company size",
        name: "company_size",
        required: true,
        step: 2,
        options: ["1-10", "11-50", "51-200", "201-1000", "1000+"],
      },
      {
        type: "select",
        label: "Budget range",
        name: "budget",
        required: true,
        step: 2,
        options: ["< $10k", "$10k–$50k", "$50k–$250k", "$250k+"],
      },
      {
        type: "select",
        label: "Timeline",
        name: "timeline",
        required: true,
        step: 2,
        options: ["Evaluating (6+ mo)", "Planning (3–6 mo)", "Active (< 3 mo)", "Urgent (< 30 days)"],
      },
      {
        type: "textarea",
        label: "What are you trying to solve?",
        name: "message",
        required: true,
        step: 3,
      },
    ],
  },
  {
    key: "demo_request",
    name: "Demo request",
    description: "Product-led demo request. Fast qualification, minimal friction.",
    submitLabel: "Request demo",
    action: "https://your-endpoint.example.com/demos",
    source: "Unbounce Benchmark 2024",
    fields: [
      { type: "text", label: "First name", name: "first_name", required: true },
      { type: "text", label: "Last name", name: "last_name", required: true },
      { type: "email", label: "Work email", name: "email", required: true },
      { type: "text", label: "Company", name: "company", required: true },
      {
        type: "select",
        label: "Use case",
        name: "use_case",
        required: false,
        options: [
          "Sales enablement",
          "Marketing automation",
          "Customer success",
          "Revenue operations",
          "Other",
        ],
      },
    ],
  },
  {
    key: "pricing_request",
    name: "Pricing request",
    description: "For teams with opaque / enterprise pricing. Routes to sales.",
    submitLabel: "Get pricing",
    action: "https://your-endpoint.example.com/pricing",
    source: "HubSpot 2024",
    fields: [
      { type: "text", label: "Full name", name: "name", required: true },
      { type: "email", label: "Work email", name: "email", required: true },
      { type: "text", label: "Company", name: "company", required: true },
      {
        type: "select",
        label: "Seats needed",
        name: "seats",
        required: true,
        options: ["1–10", "11–50", "51–250", "250+"],
      },
      { type: "phone", label: "Phone", name: "phone", required: false },
    ],
  },
  {
    key: "whitepaper",
    name: "White paper download",
    description: "Top-of-funnel content gate. Short form maximizes download rate.",
    submitLabel: "Download the paper",
    action: "https://your-endpoint.example.com/downloads",
    source: "Marketo Content Benchmark 2024",
    fields: [
      { type: "text", label: "Name", name: "name", required: true, placeholder: "Jane Doe" },
      { type: "email", label: "Work email", name: "email", required: true },
      { type: "text", label: "Company", name: "company", required: false },
      {
        type: "checkbox",
        label: "I'd like product updates by email",
        name: "opt_in",
        required: false,
      },
    ],
  },
  {
    key: "webinar",
    name: "Webinar signup",
    description: "Registration for a live or on-demand webinar. Add time-zone field for global audiences.",
    submitLabel: "Save my seat",
    action: "https://your-endpoint.example.com/webinars",
    source: "Zoom Webinar Benchmark 2024",
    fields: [
      { type: "text", label: "Name", name: "name", required: true },
      { type: "email", label: "Email", name: "email", required: true },
      { type: "text", label: "Company", name: "company", required: false },
      { type: "text", label: "Role / title", name: "role", required: false },
      {
        type: "select",
        label: "Time zone",
        name: "timezone",
        required: true,
        options: [
          "US Pacific (PT)",
          "US Eastern (ET)",
          "UK (GMT/BST)",
          "Europe (CET)",
          "Asia-Pacific",
          "Other",
        ],
      },
    ],
  },
  {
    key: "newsletter",
    name: "Newsletter signup",
    description: "Minimal friction. Single-field is highest-converting but loses segmentation.",
    submitLabel: "Subscribe",
    action: "https://your-endpoint.example.com/subscribe",
    source: "Mailchimp Benchmark 2024",
    fields: [
      { type: "email", label: "Email address", name: "email", required: true, placeholder: "you@example.com" },
    ],
  },
  {
    key: "event_rsvp",
    name: "Event RSVP",
    description: "In-person event. Add dietary restrictions + session preferences.",
    submitLabel: "RSVP",
    action: "https://your-endpoint.example.com/rsvp",
    source: "Eventbrite Benchmark 2024",
    fields: [
      { type: "text", label: "Full name", name: "name", required: true },
      { type: "email", label: "Email", name: "email", required: true },
      { type: "text", label: "Company", name: "company", required: false },
      { type: "text", label: "Job title", name: "title", required: false },
      {
        type: "select",
        label: "Attending",
        name: "attending",
        required: true,
        options: ["Yes", "No", "Tentative"],
      },
      {
        type: "select",
        label: "Dietary restrictions",
        name: "dietary",
        required: false,
        showIf: { name: "attending", equals: "Yes" },
        options: ["None", "Vegetarian", "Vegan", "Gluten-free", "Kosher", "Halal", "Other"],
      },
    ],
  },
  {
    key: "support_ticket",
    name: "Support ticket",
    description: "Internal support form. Auto-routes by category.",
    submitLabel: "Submit ticket",
    action: "https://your-endpoint.example.com/support",
    source: "Zendesk Benchmark 2024",
    fields: [
      { type: "text", label: "Your name", name: "name", required: true },
      { type: "email", label: "Email", name: "email", required: true },
      {
        type: "select",
        label: "Category",
        name: "category",
        required: true,
        options: ["Bug report", "Account access", "Billing", "Feature request", "Other"],
      },
      {
        type: "select",
        label: "Severity",
        name: "severity",
        required: true,
        showIf: { name: "category", equals: "Bug report" },
        options: ["Low — annoyance", "Medium — workflow broken", "High — blocker", "Critical — production down"],
      },
      { type: "textarea", label: "Describe the issue", name: "description", required: true },
    ],
  },
  {
    key: "trial_signup",
    name: "Free trial signup",
    description: "Product-led. Fewer fields = higher activation. Company optional.",
    submitLabel: "Start free trial",
    action: "https://your-endpoint.example.com/trial",
    source: "OpenView PLG Benchmark 2024",
    fields: [
      { type: "email", label: "Work email", name: "email", required: true },
      { type: "text", label: "Full name", name: "name", required: true },
      { type: "text", label: "Company", name: "company", required: false },
    ],
  },
  {
    key: "contact_us",
    name: "Contact us",
    description: "Generic inbound. Wide subject options help routing.",
    submitLabel: "Send",
    action: "https://your-endpoint.example.com/contact",
    source: "HubSpot 2024",
    fields: [
      { type: "text", label: "Name", name: "name", required: true },
      { type: "email", label: "Email", name: "email", required: true },
      {
        type: "select",
        label: "What's this about?",
        name: "subject",
        required: true,
        options: [
          "Sales inquiry",
          "Partnership",
          "Press / media",
          "Customer support",
          "Other",
        ],
      },
      { type: "textarea", label: "Message", name: "message", required: true },
    ],
  },
];
