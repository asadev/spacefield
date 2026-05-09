import type { SsoConfigRow } from "../_types";

export const PROTOCOLS = ["saml", "oidc", "google", "microsoft"] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export const STATUSES = ["pending", "active", "disabled", "failed"] as const;
export type SsoStatus = (typeof STATUSES)[number];

export const PROTOCOL_LABEL: Record<Protocol, string> = {
  saml: "SAML",
  oidc: "OIDC",
  google: "Google",
  microsoft: "Microsoft",
};

export const STATUS_LABEL: Record<SsoStatus, string> = {
  pending: "Pending",
  active: "Active",
  disabled: "Disabled",
  failed: "Failed",
};

export function protocolChipClass(p: Protocol): string {
  switch (p) {
    case "saml":
      return "bg-violet-500/15 text-violet-600 dark:text-violet-400";
    case "oidc":
      return "bg-tool-accent-soft text-tool-accent";
    case "google":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
    case "microsoft":
      return "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400";
  }
}

export function statusChipClass(s: SsoStatus): string {
  switch (s) {
    case "active":
      return "bg-emerald-500/15 text-emerald-500";
    case "pending":
      return "bg-amber-500/15 text-amber-500";
    case "disabled":
      return "bg-app text-faint border border-app";
    case "failed":
      return "bg-rose-500/15 text-rose-500";
  }
}

/* ─────────────────────── per-protocol fields ─────────────────────── */

export type ProtocolFieldKey =
  | "entity_id"
  | "sso_url"
  | "certificate"
  | "metadata_xml"
  | "client_id"
  | "client_secret_env";

export const PROTOCOL_FIELDS: Record<Protocol, ProtocolFieldKey[]> = {
  saml: ["entity_id", "sso_url", "certificate", "metadata_xml"],
  oidc: ["client_id", "client_secret_env", "sso_url"],
  google: ["client_id", "client_secret_env"],
  microsoft: ["client_id", "client_secret_env"],
};

export const FIELD_LABEL: Record<ProtocolFieldKey, string> = {
  entity_id: "Entity ID",
  sso_url: "SSO URL",
  certificate: "Certificate",
  metadata_xml: "Metadata XML",
  client_id: "Client ID",
  client_secret_env: "Client secret env var",
};

export const FIELD_HINT: Record<ProtocolFieldKey, string> = {
  entity_id: "Identity Provider entity ID (the urn or URL the IdP uses).",
  sso_url:
    "URL the user is redirected to for sign-in (POST for SAML, authorize for OIDC).",
  certificate:
    "x509 PEM the IdP signs assertions with. Used to verify SAML responses.",
  metadata_xml:
    "Optional — paste the full IdP metadata XML if you'd rather not fill the individual fields.",
  client_id: "OAuth client id from the IdP / Google / Microsoft console.",
  client_secret_env:
    "Name of the environment variable that holds the secret (the value is never stored in the database).",
};

export const TEXTAREA_FIELDS = new Set<ProtocolFieldKey>([
  "certificate",
  "metadata_xml",
]);

export function describeMissingFields(
  protocol: Protocol,
  row: Partial<SsoConfigRow>
): ProtocolFieldKey[] {
  const required = PROTOCOL_FIELDS[protocol] ?? [];
  return required.filter((k) => {
    const v = row[k as keyof SsoConfigRow];
    return !v || (typeof v === "string" && v.trim() === "");
  });
}
