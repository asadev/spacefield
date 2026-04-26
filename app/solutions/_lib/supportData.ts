// Support & Ops — shared reference data.
// Cited benchmarks + runbook presets. Used across multiple support tools.

// ─── SLA COMPARISON ────────────────────────────────────────────────────────
// Source: Published provider SLA docs (2024–2025). Percentages are the
// contractual monthly service commitment for the headline service.
export interface ProviderSla {
  provider: string;
  service: string;
  sla: number;
  note?: string;
}

export const PROVIDER_SLAS: ProviderSla[] = [
  { provider: "AWS", service: "EC2 (multi-AZ)", sla: 99.99 },
  { provider: "AWS", service: "S3 Standard", sla: 99.9, note: "availability" },
  { provider: "GCP", service: "Compute Engine (multi-zone)", sla: 99.99 },
  { provider: "Azure", service: "Virtual Machines (multi-zone)", sla: 99.99 },
  { provider: "Stripe", service: "API", sla: 99.95 },
  { provider: "Cloudflare", service: "Edge network", sla: 100, note: "business plans" },
  { provider: "Twilio", service: "Programmable Messaging", sla: 99.95 },
  { provider: "GitHub", service: "Enterprise Cloud", sla: 99.9 },
  { provider: "Slack", service: "Enterprise Grid", sla: 99.99 },
  { provider: "Zoom", service: "Meetings", sla: 99.99 },
];

// ─── MTTR BENCHMARKS ───────────────────────────────────────────────────────
// Source: Atlassian Incident Management Handbook 2024, PagerDuty State of
// Digital Operations 2024. Median times from enterprise-grade ops orgs.
export const MTTR_BENCHMARKS = {
  SEV1: { medianHours: 4, label: "SEV1 (outage)" },
  SEV2: { medianHours: 24, label: "SEV2 (degraded)" },
  SEV3: { medianHours: 72, label: "SEV3 (minor)" },
  SEV4: { medianHours: 336, label: "SEV4 (cosmetic)" },
} as const;

// ─── DOWNTIME COST BY INDUSTRY ─────────────────────────────────────────────
// Source: Gartner 2024 Downtime Cost Study; ITIC 2024 Cost of Downtime report.
// Average across mid-enterprise orgs. Values in USD per minute of P1 outage.
export interface IndustryCost {
  industry: string;
  perMin: number;
  note?: string;
}

export const INDUSTRY_DOWNTIME_COSTS: IndustryCost[] = [
  { industry: "Retail (e-commerce)", perMin: 3200, note: "cart-abandonment sensitive" },
  { industry: "Finance / trading", perMin: 8800, note: "missed transactions" },
  { industry: "Healthcare", perMin: 9300, note: "regulatory + clinical impact" },
  { industry: "SaaS / software", perMin: 5600, note: "Gartner average" },
  { industry: "Manufacturing", perMin: 4200, note: "halted production lines" },
  { industry: "Media / streaming", perMin: 2500, note: "ad-revenue loss" },
  { industry: "Telecommunications", perMin: 7900 },
  { industry: "Logistics", perMin: 3800 },
];

export const GARTNER_AVG_DOWNTIME_COST_PER_MIN = 5600; // USD. "Gartner 2024 Downtime Cost Study"

// ─── SUPPORT KPI BENCHMARKS ────────────────────────────────────────────────
// Source: Zendesk CX Trends 2024 + HubSpot Customer Service Report 2024.
// Values are industry medians.
export interface KpiBenchmark {
  key: string;
  label: string;
  median: number;
  unit: string;
  direction: "up" | "down";
  source: string;
}

export const KPI_BENCHMARKS: KpiBenchmark[] = [
  { key: "frt", label: "First-response time", median: 180, unit: "min", direction: "down", source: "Zendesk CX 2024" },
  { key: "resolution", label: "Resolution time", median: 8, unit: "hr", direction: "down", source: "Zendesk CX 2024" },
  { key: "csat", label: "CSAT", median: 85, unit: "%", direction: "up", source: "HubSpot Svc 2024" },
  { key: "nps", label: "NPS", median: 35, unit: "", direction: "up", source: "HubSpot Svc 2024" },
  { key: "volume", label: "Ticket volume", median: 500, unit: "/wk", direction: "down", source: "Zendesk CX 2024" },
  { key: "backlog", label: "Backlog", median: 50, unit: "tickets", direction: "down", source: "Zendesk CX 2024" },
];

// ─── RUNBOOK PRESETS ───────────────────────────────────────────────────────
export interface RunbookStep {
  text: string;
}
export interface RunbookContact {
  role: string;
  name: string;
  contact: string;
}
export interface RunbookPreset {
  key: string;
  label: string;
  source?: string;
  title: string;
  trigger: string;
  checks: RunbookStep[];
  mitigation: RunbookStep[];
  escalation: RunbookContact[];
  rollback: string;
  acceptance: string;
}

// 10 real-world runbook presets, distilled from SRE and ops playbooks
// published by Google, AWS, Stripe, Cloudflare, Atlassian, PagerDuty.
export const RUNBOOK_PRESETS: RunbookPreset[] = [
  {
    key: "db-failover",
    label: "Database failover",
    source: "AWS RDS + Google SRE Book",
    title: "Database failover (primary unhealthy)",
    trigger: "Primary database unreachable for > 60s OR replication lag > 120s OR p99 write latency > 3s for 5 min.",
    checks: [
      { text: "Confirm alert in monitoring (not a false positive)." },
      { text: "Check primary instance health in cloud console." },
      { text: "Confirm replica lag and replica health." },
      { text: "Check network/connectivity to DB from app tier." },
      { text: "Look for long-running transactions or lock contention." },
    ],
    mitigation: [
      { text: "Promote healthy read-replica to primary." },
      { text: "Update DNS / connection string as needed." },
      { text: "Verify application reconnects and writes succeed." },
      { text: "Monitor for replication catchup on old primary." },
    ],
    escalation: [
      { role: "DB on-call", name: "", contact: "page via PagerDuty" },
      { role: "Incident commander", name: "", contact: "SEV1 → page after 10 min" },
    ],
    rollback: "If the promoted replica has issues, fail back once original primary is confirmed healthy and replication is caught up.",
    acceptance: "Writes succeed for 10 minutes. Error rate returns to baseline. Replication re-established on both directions.",
  },
  {
    key: "k8s-pod-restart",
    label: "Kubernetes pod restart",
    source: "Kubernetes SIG-Ops playbook",
    title: "Pod restart (CrashLoopBackOff / OOMKilled)",
    trigger: "Pod in CrashLoopBackOff, OOMKilled count > 3 in 10 min, or readiness probe failing > 2 min.",
    checks: [
      { text: "`kubectl describe pod <name>` — inspect events." },
      { text: "`kubectl logs <pod> --previous` — check crash logs." },
      { text: "Check resource requests/limits vs node capacity." },
      { text: "Verify upstream dependencies (DB, cache, config)." },
    ],
    mitigation: [
      { text: "Scale replicas up by 1 to absorb traffic." },
      { text: "Cordon and drain the affected node if node-level." },
      { text: "Apply memory-limit patch if OOMKilled." },
      { text: "`kubectl rollout restart deployment/<name>`." },
    ],
    escalation: [
      { role: "Platform on-call", name: "", contact: "Slack #platform-oncall" },
    ],
    rollback: "If the fresh pods don't stabilize within 10 min, `kubectl rollout undo deployment/<name>` to previous revision.",
    acceptance: "All replicas Ready. Error rate < 0.5% for 15 min. No CrashLoopBackOff on any pod.",
  },
  {
    key: "aws-region-failover",
    label: "AWS region failover",
    source: "AWS Well-Architected Reliability Pillar",
    title: "Multi-region failover",
    trigger: "Primary region unavailable (AWS status page red) OR health checks failing from > 3 geographies for > 5 min.",
    checks: [
      { text: "Confirm AWS region status (not just our service)." },
      { text: "Check Route 53 / global accelerator health-check state." },
      { text: "Confirm secondary region has warm capacity." },
      { text: "Check cross-region replication lag for databases." },
    ],
    mitigation: [
      { text: "Flip Route 53 weighted routing to secondary region (100%)." },
      { text: "Scale secondary region to handle full traffic." },
      { text: "Promote secondary DBs to writable (or accept read-only)." },
      { text: "Update status page + notify customers." },
    ],
    escalation: [
      { role: "SRE lead", name: "", contact: "page via PagerDuty" },
      { role: "CTO", name: "", contact: "SMS + call after 15 min" },
      { role: "Customer success lead", name: "", contact: "for external comms" },
    ],
    rollback: "Once primary region is healthy for 60+ min, gradually shift traffic back (10% → 50% → 100%). Catch up replication first.",
    acceptance: "Secondary region carrying 100% of traffic. p95 latency within 150% of primary baseline. No data loss detected.",
  },
  {
    key: "payment-outage",
    label: "Payment gateway outage",
    source: "Stripe incident playbook",
    title: "Payment gateway outage",
    trigger: "Payment success rate drops below 90% for 5 min OR gateway returns 5xx on > 10% of calls.",
    checks: [
      { text: "Check gateway status page (Stripe, Adyen, etc.)." },
      { text: "Correlate with our error rate by card brand." },
      { text: "Check webhook queue depth." },
      { text: "Verify API key rotation hasn't failed silently." },
    ],
    mitigation: [
      { text: "Switch to secondary payment processor if configured." },
      { text: "Queue failed charges for retry with idempotency keys." },
      { text: "Update public status page." },
      { text: "Pause non-essential batch jobs to reduce gateway load." },
    ],
    escalation: [
      { role: "Finance lead", name: "", contact: "" },
      { role: "Customer support lead", name: "", contact: "" },
      { role: "Gateway account manager", name: "", contact: "" },
    ],
    rollback: "Switch back to primary processor once success rate > 98% for 30 min. Drain retry queue after primary is stable.",
    acceptance: "Payment success rate > 98%. Webhook backlog cleared. No lingering failed charges. Reconciliation matches within 1%.",
  },
  {
    key: "ssl-cert-renewal",
    label: "SSL/TLS certificate renewal",
    source: "Let's Encrypt + Cloudflare ops docs",
    title: "SSL/TLS certificate renewal",
    trigger: "Cert expires in < 14 days OR auto-renewal failed OR cert chain validation broken.",
    checks: [
      { text: "`openssl s_client -connect host:443` — confirm chain." },
      { text: "Check ACME / certbot logs for renewal errors." },
      { text: "Verify DNS records for ACME challenge are correct." },
      { text: "Confirm load balancer / CDN has capacity to receive new cert." },
    ],
    mitigation: [
      { text: "Manually trigger ACME renewal." },
      { text: "If ACME fails, fall back to a paid CA (DigiCert, Sectigo)." },
      { text: "Upload renewed cert to ALB/CloudFront/nginx." },
      { text: "Reload web servers gracefully." },
    ],
    escalation: [
      { role: "Platform on-call", name: "", contact: "Slack #platform" },
      { role: "Security team", name: "", contact: "if private key compromised" },
    ],
    rollback: "If the new cert breaks trust, revert to old cert if still valid, otherwise serve an expired-cert warning page with link to mobile app.",
    acceptance: "All HTTPS endpoints serve the renewed cert. Browser trust check passes from 3 geographies. No mixed-content warnings.",
  },
  {
    key: "ddos-mitigation",
    label: "DDoS mitigation",
    source: "Cloudflare + AWS Shield playbook",
    title: "DDoS attack mitigation",
    trigger: "Request rate > 10× baseline OR CPU / bandwidth on edge > 90% OR origin errors spike with traffic flood.",
    checks: [
      { text: "Confirm via WAF analytics — is this real traffic or an attack?" },
      { text: "Identify attack vector (volumetric, L7, slowloris)." },
      { text: "Check top offending IPs / ASNs / user-agents." },
      { text: "Verify Shield / Cloudflare is engaged." },
    ],
    mitigation: [
      { text: "Enable 'I'm under attack' mode or equivalent JS challenge." },
      { text: "Rate-limit by IP / ASN / country as needed." },
      { text: "Block offending ASNs at WAF." },
      { text: "Scale origin to absorb remaining legitimate traffic." },
      { text: "Engage Cloudflare / AWS Shield Response Team." },
    ],
    escalation: [
      { role: "Security on-call", name: "", contact: "page via PagerDuty" },
      { role: "WAF provider (Cloudflare/AWS)", name: "", contact: "paid support hotline" },
    ],
    rollback: "Once attack subsides, lower challenge intensity in stages (challenge-every → challenge-suspicious → off). Keep rate-limits until 24h clean.",
    acceptance: "Legitimate traffic flows normally. Attack traffic blocked at edge. No origin overload. WAF metrics normal.",
  },
  {
    key: "cache-invalidation",
    label: "Cache invalidation / stale data",
    source: "Cloudflare + Fastly ops docs",
    title: "Cache invalidation (stale content served)",
    trigger: "User reports of stale data OR cache hit ratio spikes abnormally high OR version header mismatch between cache and origin.",
    checks: [
      { text: "Identify scope: single URL, path prefix, or global?" },
      { text: "Verify origin is serving the new content correctly." },
      { text: "Check cache-control headers on the origin response." },
      { text: "Inspect CDN logs for the object version." },
    ],
    mitigation: [
      { text: "Purge by URL or tag on CDN (Cloudflare/Fastly/CloudFront)." },
      { text: "If widespread, issue a global purge (risky — watch origin load)." },
      { text: "Add cache-busting query string on next deploy." },
      { text: "Lower TTL temporarily while investigating root cause." },
    ],
    escalation: [
      { role: "Platform on-call", name: "", contact: "" },
      { role: "CDN account manager", name: "", contact: "for global purge approval" },
    ],
    rollback: "Restore original TTL once stable. No code rollback needed.",
    acceptance: "Users see fresh content. Cache hit ratio returns to normal band. Origin load stable.",
  },
  {
    key: "zero-day-patch",
    label: "Zero-day vulnerability patch",
    source: "CISA + NIST NVD guidance",
    title: "Zero-day vulnerability patch rollout",
    trigger: "Critical CVE (CVSS 9+) published affecting a dependency in our stack, OR active exploit reported.",
    checks: [
      { text: "Confirm CVE applies (version + config)." },
      { text: "Check CVE disclosure + vendor advisory." },
      { text: "Scan prod for vulnerable versions (Dependabot, Snyk)." },
      { text: "Identify attack surface — internet-facing first." },
    ],
    mitigation: [
      { text: "Apply virtual patch at WAF if available (block exploit pattern)." },
      { text: "Patch internet-facing services first." },
      { text: "Rolling deploy to internal services." },
      { text: "Rotate any exposed secrets." },
      { text: "Notify customers if required by SLA or regulation." },
    ],
    escalation: [
      { role: "CISO / Security lead", name: "", contact: "" },
      { role: "Legal / compliance", name: "", contact: "if disclosure needed" },
      { role: "VP Engineering", name: "", contact: "" },
    ],
    rollback: "If patch causes regressions, pin to previous version BUT keep WAF virtual patch in place. Document accepted risk.",
    acceptance: "All affected services on patched version. WAF rule removed only after coverage verified. Customer comms sent if required.",
  },
  {
    key: "data-migration",
    label: "Customer data migration",
    source: "Atlassian data-ops playbook",
    title: "Customer data migration",
    trigger: "Scheduled migration window OR customer-requested data region move OR schema/engine upgrade required.",
    checks: [
      { text: "Confirm customer sign-off and maintenance window." },
      { text: "Run pre-migration validation (row counts, checksums)." },
      { text: "Confirm rollback snapshot / backup exists." },
      { text: "Notify affected users / downstream systems." },
    ],
    mitigation: [
      { text: "Put service in read-only mode." },
      { text: "Run ETL / replication job." },
      { text: "Run post-migration validation (row counts, checksums, sample queries)." },
      { text: "Flip writes to new store." },
      { text: "Monitor error rates + data consistency for 24h." },
    ],
    escalation: [
      { role: "Data engineering lead", name: "", contact: "" },
      { role: "Customer success manager", name: "", contact: "if customer-specific" },
    ],
    rollback: "If validation fails, revert writes to old store. Restore from snapshot if data corrupted. Extend customer maintenance window.",
    acceptance: "Row counts match source. Sample queries return identical results. Writes succeed on new store. No error-rate regression for 24h.",
  },
  {
    key: "acquisition-merger",
    label: "Acquisition / infra merger",
    source: "PagerDuty M&A integration playbook",
    title: "Acquired-company infra merger",
    trigger: "Legal close done. IT integration wave scheduled. Or incident inside acquired infra that needs our on-call to respond.",
    checks: [
      { text: "Confirm network / VPN / IAM mapping between orgs." },
      { text: "Inventory acquired company's monitoring + on-call." },
      { text: "Identify critical dependencies on our side." },
      { text: "Confirm legal approval for data access." },
    ],
    mitigation: [
      { text: "Federate SSO (SAML) between orgs." },
      { text: "Establish shared on-call rotation with clear ownership boundary." },
      { text: "Merge monitoring into unified dashboard (or cross-link)." },
      { text: "Document service catalog, SLAs, escalation paths in one place." },
    ],
    escalation: [
      { role: "VP Engineering (both orgs)", name: "", contact: "" },
      { role: "Security / compliance lead", name: "", contact: "" },
      { role: "Legal", name: "", contact: "for data access concerns" },
    ],
    rollback: "If integration causes a security / reliability incident, isolate acquired infra behind a firewall. Unwind SSO temporarily. Document lessons.",
    acceptance: "Unified on-call responding to incidents in both codebases. Shared dashboards live. No security incidents traced to merger. SLAs maintained.",
  },
];

export function findPreset(key: string): RunbookPreset | undefined {
  return RUNBOOK_PRESETS.find((p) => p.key === key);
}

// ─── POSTMORTEM TEMPLATES ──────────────────────────────────────────────────
// Distilled from publicly available postmortem format guides.
export interface PostmortemTemplate {
  key: string;
  name: string;
  source: string;
  description: string;
  sections: string[];
  tone: string; // guidance for authors
}

export const POSTMORTEM_TEMPLATES: PostmortemTemplate[] = [
  {
    key: "google-sre",
    name: "Google SRE",
    source: "Google SRE Book — ch. 15",
    description: "Strict blameless format. Heavy on timeline fidelity, action-item ownership, and 'what went well' vs 'what went wrong'.",
    sections: [
      "Summary (1 paragraph)",
      "Impact (users, revenue, duration, SLO burn)",
      "Root causes",
      "Trigger",
      "Resolution",
      "Detection",
      "Action items (who, what, when, link to bug)",
      "Lessons learned — what went well / what went wrong / where we got lucky",
      "Timeline (UTC timestamps)",
      "Supporting information (graphs, chat logs)",
    ],
    tone: "Blameless, first-person plural, factual. Link every claim to a graph or log.",
  },
  {
    key: "atlassian",
    name: "Atlassian IMH",
    source: "Atlassian Incident Management Handbook",
    description: "Customer-communication focused. Emphasizes public-facing summary, SLA impact, and next steps.",
    sections: [
      "Incident summary (for customers)",
      "Leadup",
      "Fault",
      "Impact",
      "Detection",
      "Response",
      "Recovery",
      "Timeline",
      "Root cause identification — 5 whys",
      "Backlog check (was this a known risk?)",
      "Recurrence",
      "Lessons learned",
      "Corrective actions",
    ],
    tone: "Customer-facing summary up top. Rest is engineering-rigorous. Use 5-whys for root cause.",
  },
  {
    key: "etsy",
    name: "Etsy (Just Culture)",
    source: "Etsy 'Debriefing Facilitation Guide'",
    description: "Originated the 'just culture' approach. Focuses on how the human-in-the-loop made sense of the situation at the time.",
    sections: [
      "Summary",
      "Timeline",
      "Contributing factors",
      "Mitigations",
      "Remediation items",
      "Questions asked during the debrief",
      "How could we have detected this sooner?",
      "How could the operator have acted differently with the info they had?",
    ],
    tone: "Understand the second story. Ask what made it make sense at the time, not why someone 'should have known'.",
  },
  {
    key: "github",
    name: "GitHub (public style)",
    source: "GitHub public incident reports",
    description: "Public-facing format with deep technical narrative. Used for high-visibility incidents where transparency is required.",
    sections: [
      "What happened (plain English for non-engineers)",
      "Background (system context a reader needs)",
      "Impact",
      "Timeline",
      "Root cause (technical deep-dive)",
      "Remediation",
      "Moving forward",
    ],
    tone: "Narrative. Readable by non-engineers but technically precise. Include diagrams.",
  },
  {
    key: "pagerduty",
    name: "PagerDuty",
    source: "PagerDuty Incident Response docs",
    description: "Operations-focused, optimized for fast turnaround and cross-team follow-up.",
    sections: [
      "Incident overview",
      "Key metrics (MTTR, TTR, alert→ack time)",
      "Timeline",
      "Root cause",
      "Resolution",
      "What went well",
      "What didn't go well",
      "Where we got lucky",
      "Action items (P0/P1/P2 prioritized)",
    ],
    tone: "Metric-heavy. Explicit priorities on action items. Suitable for weekly ops review.",
  },
];
