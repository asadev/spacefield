/* Privacy-respecting hash for IP / UA logging.
 *
 * We never store raw IPs or user agents — only a salted hash for dedupe
 * within a viewer session. The salt rotates daily so historical records
 * can't be cross-correlated.
 */

export async function hashClientFingerprint(input: string): Promise<string> {
  if (!input) return "";
  const day = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`toshare:${day}:${input}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
