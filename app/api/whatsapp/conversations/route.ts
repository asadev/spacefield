import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

/** Strip the `@<server>` suffix from a WhatsApp JID, returning digits-only.
 *  whatsapp_messages.from_number / .to_number are stored digits-only, but
 *  Evolution's findContacts returns full JIDs — normalise to compare. */
function jidToDigits(jid: string): string {
  return jid.split("@")[0]?.replace(/\D/g, "") ?? jid;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/conversations?workspace_id=...
 *
 * Groups public.whatsapp_messages by the resolved "thread key" (CRM contact
 * if linked, otherwise the raw phone number) and returns one row per
 * conversation with the latest-message preview + unread count.
 *
 * Response shape (UI unwraps `items`):
 *   { items: [{ contact_id, phone, name, unread_count, last_message_at,
 *               last_message_preview, last_direction }, ...] }
 *
 * Why we aggregate in the route (not via a Postgres VIEW): the WhatsApp
 * tables are still young (added 2026-05-27); we keep migrations small and
 * push the join into the route. Volume is bounded by one row per contact
 * per workspace — a few thousand at worst — and a single ordered scan over
 * (workspace_id, created_at desc) is fast enough.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Pull the most-recent N messages for the workspace. We aggregate
  // client-side so the unread count + last preview are derived from one
  // ordered scan. N=2000 caps memory + keeps the route under maxDuration.
  const { data: rowsRaw, error } = await admin
    .from("whatsapp_messages")
    .select(
      "id, contact_id, direction, from_number, to_number, body, status, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) return jsonError(error.message, 500);

  type Row = {
    id: string;
    contact_id: string | null;
    direction: "inbound" | "outbound";
    from_number: string | null;
    to_number: string | null;
    body: string | null;
    status: string;
    created_at: string;
  };
  const rows = (rowsRaw ?? []) as Row[];

  type Acc = {
    contact_id: string | null;
    phone: string;
    name: string | null;
    is_group: boolean;
    unread_count: number;
    last_message_at: string;
    last_message_preview: string;
    last_direction: "inbound" | "outbound";
  };

  // Bucket by the resolved thread key. Prefer contact_id when present
  // (avoids splitting threads when a contact has multiple normalised
  // representations of the same phone).
  const byKey = new Map<string, Acc>();
  for (const r of rows) {
    const phone =
      (r.direction === "inbound" ? r.from_number : r.to_number) ?? "";
    const key = r.contact_id ?? `phone:${phone}`;
    const preview = (r.body ?? "").slice(0, 140);
    const existing = byKey.get(key);
    // Heuristic: WhatsApp group JIDs are 18+ digits and start with
    // 120363… (Baileys multi-device era). Real phone numbers max out
    // around 15 digits. We finalise this with the Evolution lookup
    // below, but having a default flag means a JID with no contact
    // record still renders as a group.
    const looksLikeGroup =
      phone.length >= 17 || phone.startsWith("120363");
    if (!existing) {
      byKey.set(key, {
        contact_id: r.contact_id,
        phone,
        name: null,
        is_group: looksLikeGroup,
        // status='read' is the marker the webhook flips when the customer's
        // device reports it read — we count anything else inbound that is
        // newer than the user's last seen as "unread".
        unread_count:
          r.direction === "inbound" && r.status !== "read" ? 1 : 0,
        last_message_at: r.created_at,
        last_message_preview: preview,
        last_direction: r.direction,
      });
    } else if (r.direction === "inbound" && r.status !== "read") {
      existing.unread_count += 1;
    }
  }

  // Hydrate contact names in a single round-trip — CRM first.
  const contactIds = Array.from(byKey.values())
    .map((v) => v.contact_id)
    .filter((id): id is string => !!id);
  if (contactIds.length > 0) {
    const { data: contacts } = await admin
      .from("crm_contacts")
      .select("id, first_name, last_name, phone")
      .in("id", contactIds);
    const byId = new Map(
      (contacts ?? []).map((c) => [
        (c as { id: string }).id,
        c as { id: string; first_name: string | null; last_name: string | null; phone: string | null },
      ]),
    );
    for (const v of byKey.values()) {
      if (!v.contact_id) continue;
      const c = byId.get(v.contact_id);
      if (!c) continue;
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      v.name = name || null;
      if (!v.phone && c.phone) v.phone = c.phone;
    }
  }

  // Fallback name resolution: pull from Baileys + group-info endpoints.
  // Three passes:
  //   (a) /chat/findContacts → pushName for individuals (OK), plus the
  //       isGroup flag. Evolution's pushName for GROUP JIDs is the
  //       latest sender's display name, NOT the group subject — a
  //       known data-model quirk — so we ignore the pushName field
  //       for groups and resolve them via (c).
  //   (b) detect "self" (your own paired number) and label as "You".
  //   (c) for every group JID in the conversation list, call
  //       /group/findGroupInfos in parallel to get the real subject.
  //
  // Best-effort: any Evolution call failure just leaves the row with a
  // phone number — no regression. Caught 2026-05-27 by Asad's screenshot
  // where group threads showed sender names instead of group subjects.
  try {
    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("evolution_instance_name, phone_number")
      .eq("workspace_id", workspaceId)
      .in("status", ["connected", "qr_pending", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = inst as {
      evolution_instance_name?: string;
      phone_number?: string | null;
    } | null;
    const instanceName = row?.evolution_instance_name;
    const selfDigits = row?.phone_number
      ? row.phone_number.replace(/\D/g, "")
      : null;

    if (instanceName) {
      const client = getEvolutionClient();

      // (a) Pull every contact, then build a digits→{name, isGroup} map.
      const evoContacts = await client.findContacts(instanceName);
      const byDigits = new Map<
        string,
        { pushName: string | null; isGroup: boolean }
      >();
      for (const c of evoContacts) {
        const d = jidToDigits(c.remoteJid);
        if (!d) continue;
        byDigits.set(d, { pushName: c.pushName, isGroup: c.isGroup });
      }
      for (const v of byKey.values()) {
        const lookup = byDigits.get(v.phone);
        if (lookup) {
          v.is_group = lookup.isGroup;
          // Only use pushName for NON-group entries. For groups it's
          // the latest sender's name (Evolution quirk) — handled in (c).
          if (!lookup.isGroup && !v.name && lookup.pushName) {
            v.name = lookup.pushName;
          }
        }
      }

      // (b) Self.
      if (selfDigits) {
        for (const v of byKey.values()) {
          if (v.phone === selfDigits && !v.is_group) {
            v.name = v.name ?? "You";
          }
        }
      }

      // (c) Group subjects.
      //
      // AUD-01/AUD-03: this used to fire one live findGroupInfo per group JID in
      // parallel. Under Evolution load that partially failed (modern 120363…
      // groups came back name:null) and risked a 504. We now resolve subjects
      // from the whatsapp_groups CACHE first (single workspace-scoped query) and
      // only fall back to a small, bounded number of live lookups for groups not
      // yet cached — so this route can never 504 on name resolution.
      const uniqueGroupDigits = Array.from(
        new Set(
          Array.from(byKey.values())
            .filter((v) => v.is_group)
            .map((v) => v.phone),
        ),
      );
      if (uniqueGroupDigits.length > 0) {
        const subjectByDigits = new Map<string, string>();

        // whatsapp_groups.evolution_group_id stores the FULL JID
        // ("<localpart>@g.us"); v.phone is the digits-only localpart. Match by
        // stripping the suffix off the cached JID.
        const { data: cachedGroups } = await admin
          .from("whatsapp_groups")
          .select("evolution_group_id, name")
          .eq("workspace_id", workspaceId);
        for (const g of cachedGroups ?? []) {
          const row = g as { evolution_group_id: string; name: string | null };
          if (!row.name) continue;
          const localPart = row.evolution_group_id.split("@")[0];
          if (!localPart) continue;
          subjectByDigits.set(localPart, row.name);
        }

        // Live fallback ONLY for groups missing from the cache, capped so this
        // route can never 504. The rest keep their phone JID until a Groups-tab
        // sync populates the cache.
        const missing = uniqueGroupDigits.filter(
          (d) => !subjectByDigits.has(d),
        );
        const MAX_LIVE_LOOKUPS = 5;
        const LIVE_LOOKUP_TIMEOUT_MS = 4_000;
        if (missing.length > 0) {
          const toLookup = missing.slice(0, MAX_LIVE_LOOKUPS);
          const subjects = await Promise.all(
            toLookup.map(async (digits): Promise<string | null> => {
              const jid = `${digits}@g.us`;
              try {
                const info = await Promise.race([
                  client.findGroupInfo(instanceName, jid),
                  new Promise<null>((resolve) =>
                    setTimeout(() => resolve(null), LIVE_LOOKUP_TIMEOUT_MS),
                  ),
                ]);
                return info?.subject ?? null;
              } catch {
                return null;
              }
            }),
          );
          toLookup.forEach((digits, i) => {
            const subj = subjects[i];
            if (subj) subjectByDigits.set(digits, subj);
          });
        }

        for (const v of byKey.values()) {
          if (!v.is_group) continue;
          const subj = subjectByDigits.get(v.phone);
          if (subj) v.name = subj;
        }
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp.conversations] name-hydration failed, falling back to phone numbers:",
      e instanceof Error ? e.message : String(e),
    );
  }

  const items = Array.from(byKey.values()).sort(
    (a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at),
  );

  return NextResponse.json({ items });
}
