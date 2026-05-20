import { redirect, permanentRedirect } from "next/navigation";

/* /privacy — legacy route. The canonical Privacy Policy lives at
 * /legal/privacy (May 13 rewrite). We do a permanent redirect so
 * crawlers and existing links transparently flow to the new URL.
 *
 * `permanentRedirect()` emits a 308 (preferred over 301 since Next 14)
 * which preserves method semantics — relevant only for the future
 * case of a redirected POST, but free correctness either way. */
export default function PrivacyRedirect(): never {
  // Prefer permanentRedirect when available (Next 13.4+). Fall back
  // to redirect() — both throw and never return.
  if (typeof permanentRedirect === "function") {
    permanentRedirect("/legal/privacy");
  }
  redirect("/legal/privacy");
}
