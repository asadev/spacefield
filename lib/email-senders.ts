/* Centralized "from" addresses for Space Field outbound email.
 *
 * Resend can send from any address on the verified domain (spacefield.co),
 * so the limit is what addresses make sense to expose, not what's
 * technically possible.
 *
 * Each role maps to:
 *   - from:     the formatted "Name <addr>" string used as the From header
 *   - replyTo:  optional override (usually the same address; helpful when
 *               we want replies to land somewhere different than the From)
 *   - inbox:    where we expect replies / new mail to land for this role.
 *               This is currently a forward target — when we wire inbound
 *               (ImprovMX / Cloudflare Email Routing / Zoho), this is where
 *               mail to <role>@spacefield.co will be delivered.
 */

export type EmailRole =
  | "noreply"     // system, auth, never expect replies
  | "hello"       // friendly outbound, welcome emails
  | "info"        // general inquiries
  | "support"     // bugs, accounts, "help me"
  | "sales"       // billing, enterprise, contracts
  | "invites"     // workspace + auth invitations
  | "security"    // disclosures, vuln reports
  | "legal";      // privacy/data/DMCA

export interface EmailSender {
  from: string;
  replyTo?: string;
  inbox: string;       // where replies should land (Gmail, for forwarding setups)
}

const TEAM_INBOX = "hello@example.com";

export const SENDERS: Record<EmailRole, EmailSender> = {
  noreply: {
    from: "Space Field <noreply@spacefield.co>",
    // Replies to noreply should still get a human — funnel to support.
    replyTo: "support@spacefield.co",
    inbox: TEAM_INBOX,
  },
  hello: {
    from: "Space Field <hello@spacefield.co>",
    inbox: TEAM_INBOX,
  },
  info: {
    from: "Space Field <info@spacefield.co>",
    inbox: TEAM_INBOX,
  },
  support: {
    from: "Space Field Support <support@spacefield.co>",
    inbox: TEAM_INBOX,
  },
  sales: {
    from: "Space Field Sales <sales@spacefield.co>",
    inbox: TEAM_INBOX,
  },
  invites: {
    from: "Space Field <invites@spacefield.co>",
    replyTo: "support@spacefield.co",
    inbox: TEAM_INBOX,
  },
  security: {
    from: "Space Field Security <security@spacefield.co>",
    inbox: TEAM_INBOX,
  },
  legal: {
    from: "Space Field Legal <legal@spacefield.co>",
    inbox: TEAM_INBOX,
  },
};

/* Pick the best sender role for a contact-form topic. */
export function senderForContactTopic(
  topic: string | undefined | null
): EmailRole {
  switch ((topic ?? "general").toLowerCase()) {
    case "bug":
    case "feature":
      return "support";
    case "business":
    case "sales":
    case "enterprise":
      return "sales";
    case "press":
    case "general":
    default:
      return "info";
  }
}
