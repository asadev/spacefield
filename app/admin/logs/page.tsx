import Link from "next/link";

import AgentRunsTab, { type AgentRunFilters } from "./_AgentRunsTab";
import ApprovalsTab, { type ApprovalFilters } from "./_ApprovalsTab";
import CreditsTab, { type CreditFilters } from "./_CreditsTab";
import WebhookTab, { type WebhookFilters } from "./_WebhookTab";
import { TABS, buildQuery, isLogTab, type LogTab } from "./_shared";

export const dynamic = "force-dynamic";

type RawSearchParams = {
  tab?: string;
  page?: string;
  // webhooks
  status?: string;
  link?: string;
  ws?: string;
  // agent runs
  agent?: string;
  channel?: string;
  email?: string;
  // credits
  bucket?: string;
  // approvals
  expired?: string;
  // shared
  from?: string;
  to?: string;
};

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const tab: LogTab = isLogTab(sp.tab) ? sp.tab : "webhooks";
  const page = Math.max(1, Number(sp.page) || 1);

  // Each tab has its own URL-state slice. We forward only the keys
  // relevant to the active tab so cross-tab leakage doesn't happen.
  const tabBaseParams = buildBaseParams(tab, sp);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Logs
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Observability</h1>
        <p className="mt-0.5 text-xs text-muted">
          Webhook deliveries, agent runs, credit ledger, pending approvals.
        </p>
      </div>

      <TabNav active={tab} />

      {tab === "webhooks" && (
        <WebhookTab
          page={page}
          filters={pickWebhookFilters(sp)}
          baseParams={tabBaseParams}
        />
      )}
      {tab === "agent_runs" && (
        <AgentRunsTab
          page={page}
          filters={pickAgentRunFilters(sp)}
          baseParams={tabBaseParams}
        />
      )}
      {tab === "credits" && (
        <CreditsTab
          page={page}
          filters={pickCreditFilters(sp)}
          baseParams={tabBaseParams}
        />
      )}
      {tab === "approvals" && (
        <ApprovalsTab
          page={page}
          filters={pickApprovalFilters(sp)}
          baseParams={tabBaseParams}
        />
      )}
    </div>
  );
}

/* ──────────────────── helpers ──────────────────── */

function TabNav({ active }: { active: LogTab }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-app">
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={`/admin/logs${buildQuery({}, { tab: t.id })}`}
            className={[
              "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-tool-accent bg-app-elevated text-app font-medium"
                : "border-transparent text-secondary hover:text-app hover:bg-app-elevated/60",
            ].join(" ")}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

function pickWebhookFilters(sp: RawSearchParams): WebhookFilters {
  return {
    status: sp.status,
    link: sp.link,
    ws: sp.ws,
    from: sp.from,
    to: sp.to,
  };
}

function pickAgentRunFilters(sp: RawSearchParams): AgentRunFilters {
  return {
    agent: sp.agent,
    status: sp.status,
    channel: sp.channel,
    email: sp.email,
    from: sp.from,
    to: sp.to,
  };
}

function pickCreditFilters(sp: RawSearchParams): CreditFilters {
  return {
    bucket: sp.bucket,
    ws: sp.ws,
    from: sp.from,
    to: sp.to,
  };
}

function pickApprovalFilters(sp: RawSearchParams): ApprovalFilters {
  return {
    ws: sp.ws,
    expired: sp.expired,
    from: sp.from,
    to: sp.to,
  };
}

/**
 * Per-tab whitelist of search-param keys that participate in pagination.
 * Anything outside the list gets stripped from `?page=N` links — this
 * also drops the `page` key itself so the Pagination helper can set it.
 */
function buildBaseParams(
  tab: LogTab,
  sp: RawSearchParams
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { tab };
  const keys: (keyof RawSearchParams)[] = (() => {
    switch (tab) {
      case "webhooks":
        return ["status", "link", "ws", "from", "to"];
      case "agent_runs":
        return ["agent", "status", "channel", "email", "from", "to"];
      case "credits":
        return ["bucket", "ws", "from", "to"];
      case "approvals":
        return ["ws", "expired", "from", "to"];
    }
  })();
  for (const k of keys) {
    const v = sp[k];
    if (v) out[k] = v;
  }
  return out;
}
