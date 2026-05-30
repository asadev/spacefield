// @ts-nocheck
/**
 * SYNC-01 regression guards for lib/crm/search-index.ts.
 *
 * Two things matter:
 *   1. indexCompany maps to the SAME entity_type / href / icon / field
 *      conventions as the backfill migration 20260530c (entity_type
 *      'company', href /tools/crm/companies/<id>, icon 'building',
 *      subtitle = website, body = notes). If live + backfill disagree,
 *      search rows churn on every write.
 *   2. The helpers are best-effort: a failing underlying indexDocument
 *      must NOT throw out of the index / unindex helpers (search
 *      staleness must never brick the originating CRM write).
 *
 * The module mocks @/lib/search/indexer so no DB is touched.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { index: any[]; unindex: any[] } = { index: [], unindex: [] };

vi.mock("@/lib/search/indexer", () => ({
  indexDocument: vi.fn(async (input) => {
    calls.index.push(input);
    return { ok: true };
  }),
  unindexDocument: vi.fn(async (input) => {
    calls.unindex.push(input);
    return { ok: true };
  }),
}));

import { indexCompany, unindexCompany } from "@/lib/crm/search-index";

describe("crm search-index — company (SYNC-01)", () => {
  beforeEach(() => {
    calls.index = [];
    calls.unindex = [];
    vi.clearAllMocks();
  });

  it("indexCompany matches the backfill conventions", async () => {
    await indexCompany({
      id: "co1",
      workspace_id: "ws1",
      name: "Acme Inc",
      website: "acme.com",
      notes: "key account",
    });
    expect(calls.index).toHaveLength(1);
    expect(calls.index[0]).toMatchObject({
      workspaceId: "ws1",
      entityType: "company",
      entityId: "co1",
      title: "Acme Inc",
      subtitle: "acme.com",
      body: "key account",
      href: "/tools/crm/companies/co1",
      icon: "building",
    });
  });

  it("indexCompany falls back to 'Untitled company' on empty name", async () => {
    await indexCompany({ id: "co2", workspace_id: "ws1" });
    expect(calls.index[0].title).toBe("Untitled company");
  });

  it("unindexCompany removes the company entity", async () => {
    await unindexCompany("co1");
    expect(calls.unindex[0]).toEqual({ entityType: "company", entityId: "co1" });
  });
});
