import { redirect, permanentRedirect } from "next/navigation";

/* /refund — legacy route. The current legal regime folds refund
 * language into /legal/terms (May 13 rewrite); there is no standalone
 * /legal/refund. Redirect callers to /legal/terms so they land on the
 * canonical text. 308 — see /privacy/page.tsx for rationale. */
export default function RefundRedirect(): never {
  if (typeof permanentRedirect === "function") {
    permanentRedirect("/legal/terms");
  }
  redirect("/legal/terms");
}
