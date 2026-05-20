import { redirect, permanentRedirect } from "next/navigation";

/* /terms — legacy route. Canonical Terms of Service is /legal/terms
 * (May 13 rewrite). 308 redirect — see /privacy/page.tsx for rationale. */
export default function TermsRedirect(): never {
  if (typeof permanentRedirect === "function") {
    permanentRedirect("/legal/terms");
  }
  redirect("/legal/terms");
}
