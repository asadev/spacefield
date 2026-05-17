/* PII redaction for outbound LLM payloads.
 *
 * Anthropic gets the user's raw message + tool outputs as part of every
 * request. A workspace can legitimately contain emails, phone numbers,
 * Emirates IDs, passport numbers, and (rarely) credit cards. Most of the
 * time the LLM doesn't need the literal value to do its job — it just
 * needs to know "there's an email here" so it can refer to "the contact's
 * email". We swap real values for stable placeholders before the request
 * goes out, then unredact() the response so the user-facing reply still
 * reads naturally.
 *
 * The token map is per-call and never persisted. Placeholders are stable
 * within a single call (the same email always maps to the same token) so
 * the model can talk about "__PII_EMAIL_1__" coherently.
 *
 * Patterns (precedence matters — Emirates IDs run before phone numbers
 * because they contain digit runs that the phone regex would otherwise
 * swallow):
 *   1. Credit cards (13–19 digits w/ Luhn)
 *   2. Emirates IDs (784-YYYY-XXXXXXX-X)
 *   3. Passports (1–2 letters + 6–9 digits, loose)
 *   4. Emails (standard RFC-ish)
 *   5. Phones (international + UAE local)
 */

export interface RedactedText {
  /** Text with all PII swapped for stable placeholders. */
  text: string;
  /** placeholder → original value, so unredact() can restore. */
  map: Map<string, string>;
}

type Category = "EMAIL" | "PHONE" | "EID" | "PASSPORT" | "CARD";

interface PatternSpec {
  category: Category;
  regex: RegExp;
  validate?: (match: string) => boolean;
}

// Email — RFC-5322 light. Anchored not to swallow trailing punctuation.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Emirates ID — 784-YYYY-XXXXXXX-X (15 digits, fixed prefix 784).
// Allow optional spaces or hyphens between groups so we match how humans
// type it. The capture itself stays the literal substring.
const EID_RE = /784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d/g;

// Passport — 1 to 2 letters then 6–9 digits. Loose by design; the FP rate
// is bounded by the surrounding word boundary anchors. Common passport
// formats: UK (1 letter + 8 digits), US (1 letter + 8 digits), AE (letter
// + 7 digits), IN (1 letter + 7 digits), PK (2 letters + 7 digits).
const PASSPORT_RE = /\b[A-Z]{1,2}\d{6,9}\b/g;

// Phone — try international (+CC) first, then UAE local (05x). The body
// is 7 to 14 digits with optional spaces/hyphens/parens between groups.
// We intentionally don't try to be a full E.164 validator — just to catch
// the obvious cases without snagging order numbers, ZIPs, etc.
const PHONE_INTL_RE =
  /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?/g;
const PHONE_UAE_LOCAL_RE = /\b0?5\d[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

// Credit card — 13 to 19 digits, optionally separated by spaces or hyphens.
// We Luhn-check to avoid false positives on order IDs etc.
const CARD_RE = /\b(?:\d[\s-]?){12,18}\d\b/g;

function luhnValid(digits: string): boolean {
  const cleaned = digits.replace(/\D/g, "");
  if (cleaned.length < 13 || cleaned.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let n = cleaned.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Order matters: longer/more-specific patterns must run first so they
 * claim their bytes before a looser pattern (e.g. PHONE_INTL) grabs them.
 */
const PATTERNS: PatternSpec[] = [
  { category: "CARD", regex: CARD_RE, validate: (m) => luhnValid(m) },
  { category: "EID", regex: EID_RE },
  { category: "PASSPORT", regex: PASSPORT_RE },
  { category: "EMAIL", regex: EMAIL_RE },
  { category: "PHONE", regex: PHONE_INTL_RE },
  { category: "PHONE", regex: PHONE_UAE_LOCAL_RE },
];

interface Span {
  start: number;
  end: number;
  category: Category;
  value: string;
}

function collectSpans(input: string): Span[] {
  const spans: Span[] = [];
  for (const pat of PATTERNS) {
    // Clone the regex so we don't trip over /g state across calls.
    const re = new RegExp(pat.regex.source, pat.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const value = m[0];
      const start = m.index;
      const end = start + value.length;
      if (pat.validate && !pat.validate(value)) continue;
      // Skip if any existing span already covers this range — first
      // pattern wins, which is why ordering matters.
      const overlap = spans.some((s) => start < s.end && end > s.start);
      if (overlap) continue;
      spans.push({ start, end, category: pat.category, value });
    }
  }
  // Sort by start so substitution stays linear.
  spans.sort((a, b) => a.start - b.start);
  return spans;
}

/**
 * Strip PII from `input` and return both the redacted text and a
 * reversible map. Placeholders look like `__PII_EMAIL_1__` and are stable
 * within a single redact() call: the same email always maps to the same
 * token.
 */
export function redact(input: string): RedactedText {
  if (!input) return { text: input, map: new Map() };
  const spans = collectSpans(input);
  if (spans.length === 0) return { text: input, map: new Map() };

  // Reuse a placeholder if we've seen this exact value already.
  const valueToToken = new Map<string, string>();
  const counters: Record<Category, number> = {
    EMAIL: 0,
    PHONE: 0,
    EID: 0,
    PASSPORT: 0,
    CARD: 0,
  };
  const map = new Map<string, string>();

  const parts: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    parts.push(input.slice(cursor, span.start));
    let token = valueToToken.get(span.value);
    if (!token) {
      counters[span.category] += 1;
      token = `__PII_${span.category}_${counters[span.category]}__`;
      valueToToken.set(span.value, token);
      map.set(token, span.value);
    }
    parts.push(token);
    cursor = span.end;
  }
  parts.push(input.slice(cursor));
  return { text: parts.join(""), map };
}

/**
 * Reverse a redact() — replace every `__PII_<CAT>_<N>__` placeholder
 * with its original value. Unknown placeholders are left alone so a
 * model that hallucinated `__PII_EMAIL_999__` doesn't crash us.
 */
export function unredact(text: string, map: Map<string, string>): string {
  if (!text || map.size === 0) return text;
  return text.replace(/__PII_(EMAIL|PHONE|EID|PASSPORT|CARD)_\d+__/g, (m) => {
    const original = map.get(m);
    return original ?? m;
  });
}

/**
 * Merge several token maps (e.g. one per message) into a single map for
 * unredact(). Later entries win — but because placeholders are unique per
 * call, conflicts should not occur in normal use.
 */
export function mergeRedactionMaps(
  maps: Iterable<Map<string, string>>
): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of maps) {
    for (const [k, v] of m) out.set(k, v);
  }
  return out;
}

/** Convenience: count PII hits by category. Useful for telemetry. */
export function redactionStats(map: Map<string, string>): Record<Category, number> {
  const stats: Record<Category, number> = {
    EMAIL: 0,
    PHONE: 0,
    EID: 0,
    PASSPORT: 0,
    CARD: 0,
  };
  for (const key of map.keys()) {
    const m = /^__PII_(EMAIL|PHONE|EID|PASSPORT|CARD)_/.exec(key);
    if (m) stats[m[1] as Category] += 1;
  }
  return stats;
}
