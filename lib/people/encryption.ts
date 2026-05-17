import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PII helpers for employee_documents.number (Emirates ID / visa /
 * passport). The plaintext column is wiped by migration 20260517d; the
 * source of truth is the encrypted bytea column (number_encrypted) plus
 * a non-secret last-4 hint (number_last4) used for display.
 *
 * Calls into two SECURITY DEFINER RPCs created by 20260517d:
 *   - set_employee_document_number(p_doc_id, p_number)
 *   - reveal_employee_document_number(p_doc_id)
 *
 * Both go through the service-role admin client so the RPCs always see
 * a privileged JWT and run their own authz checks (workspace-membership
 * for writes, HR-role/owner-only for reveal).
 */

/** Mask a stored last-4 hint for display. Always safe to render. */
export function maskDocNumber(last4: string | null | undefined): string {
  if (!last4) return "—";
  return "•••• " + last4;
}

/** Returns the decrypted number, or null if the doc has no number set. */
export async function revealDocNumber(docId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "reveal_employee_document_number",
    { p_doc_id: docId },
  );
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/**
 * Set (or clear with null) the number on an existing employee_documents
 * row. The RPC encrypts plaintext + records last-4 + clears the legacy
 * plaintext column in one statement.
 */
export async function setDocNumber(
  docId: string,
  plain: string | null,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("set_employee_document_number", {
    p_doc_id: docId,
    p_number: plain,
  });
  if (error) throw new Error(error.message);
}
