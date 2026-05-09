import {
  attachToVercel,
  deleteDomain,
  disableDomain,
  verifyCnameAction,
  verifyTxt,
} from "../_actions";
import type { WorkspaceCustomDomainRow } from "../../_types";

const ACTION_BTN =
  "inline-flex items-center rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app disabled:opacity-40";
const PRIMARY_BTN =
  "inline-flex items-center rounded-md bg-tool-accent px-2 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";
const DANGER_BTN =
  "inline-flex items-center rounded-md border border-app bg-app px-2 py-1 text-[11px] text-rose-500 transition-colors hover:border-rose-500 disabled:opacity-40";

/* These action wrappers exist because Next's <form action={fn}> requires
 * a server action whose return type is void or ReactNode. Our underlying
 * actions return { ok, error } so they can be reused by an API route or
 * future client-component callers; here we just discard the result and
 * rely on revalidatePath() to reflect the new state on the page. */

async function verifyTxtVoid(formData: FormData): Promise<void> {
  "use server";
  await verifyTxt(formData);
}

async function verifyCnameVoid(formData: FormData): Promise<void> {
  "use server";
  await verifyCnameAction(formData);
}

async function attachVoid(formData: FormData): Promise<void> {
  "use server";
  await attachToVercel(formData);
}

async function disableVoid(formData: FormData): Promise<void> {
  "use server";
  await disableDomain(formData);
}

async function deleteVoid(formData: FormData): Promise<void> {
  "use server";
  await deleteDomain(formData);
}

export function RowActions({
  row,
  variant = "compact",
}: {
  row: WorkspaceCustomDomainRow;
  variant?: "compact" | "stacked";
}) {
  const showVerifyTxt = !row.txt_verified_at;
  const showVerifyCname = Boolean(row.txt_verified_at) && !row.cname_verified_at;
  const showAttach =
    Boolean(row.txt_verified_at) &&
    Boolean(row.cname_verified_at) &&
    !row.added_to_vercel_at;
  const showDisable = row.status === "active";

  const wrap =
    variant === "stacked"
      ? "flex flex-wrap items-center gap-2"
      : "flex flex-wrap items-center justify-end gap-1.5";

  return (
    <div className={wrap}>
      {showVerifyTxt && (
        <form action={verifyTxtVoid}>
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" className={ACTION_BTN}>
            Verify TXT
          </button>
        </form>
      )}
      {showVerifyCname && (
        <form action={verifyCnameVoid}>
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" className={ACTION_BTN}>
            Verify CNAME
          </button>
        </form>
      )}
      {showAttach && (
        <form action={attachVoid}>
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" className={PRIMARY_BTN}>
            Add to Vercel
          </button>
        </form>
      )}
      {showDisable && (
        <form action={disableVoid}>
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" className={ACTION_BTN}>
            Disable
          </button>
        </form>
      )}
      <form action={deleteVoid}>
        <input type="hidden" name="id" value={row.id} />
        <button type="submit" className={DANGER_BTN}>
          Delete
        </button>
      </form>
    </div>
  );
}
