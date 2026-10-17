/**
 * Deduplication key generation and noise filtering utilities.
 * Implements LLD §3.1 (dedup_key) and §3.3 (noise filtering).
 */

// ─── Dedup Key Construction (§3.1) ───────────────────────────────────

/**
 * Canonicalizes an email address for dedup:
 *  - lowercase and trim
 *  - strip "+tag" (e.g. user+tag@gmail.com → user@gmail.com)
 *  - for @gmail.com and @googlemail.com, strip dots from local part
 *  - handles null, undefined, empty, or malformed strings gracefully
 */
export function canonicalEmail(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return "";

  // Bounded length to prevent catastrophic memory overhead
  const safeStr = email.length > 1024 ? email.slice(0, 1024) : email;
  const lower = safeStr.toLowerCase().trim();
  const atIndex = lower.indexOf("@");
  if (atIndex === -1) return lower;

  const local = lower.slice(0, atIndex);
  const domain = lower.slice(atIndex + 1);
  if (!local || !domain) return lower;

  // Strip +tag
  const baseLocal = local.split("+")[0];

  // For gmail.com / googlemail.com, normalize domain to gmail.com and strip dots
  const isGoogle = domain === "gmail.com" || domain === "googlemail.com";
  const cleanLocal = isGoogle ? baseLocal.replace(/\./g, "") : baseLocal;
  const cleanDomain = isGoogle ? "gmail.com" : domain;

  return `${cleanLocal}@${cleanDomain}`;
}

/**
 * Builds a dedup_key per LLD §3.1:
 *   canonical(email) if email exists,
 *   otherwise "n:" + normalized_name + "@" + company_domain
 */
export function buildDedupKey(
  email: string | null | undefined,
  displayName: string | null | undefined,
  companyDomain?: string | null
): string {
  const canonical = canonicalEmail(email);
  if (canonical) {
    return canonical;
  }

  const rawName = (displayName || "unknown").slice(0, 256);
  const normName = rawName.toLowerCase().replace(/\s+/g, " ").trim() || "unknown";
  const domain = (companyDomain || "unknown").toLowerCase().trim() || "unknown";
  return `n:${normName}@${domain}`;
}

/**
 * Extracts domain from an email address safely.
 */
export function extractDomain(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return "";
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return "";
  return email.slice(atIndex + 1).toLowerCase().trim();
}

// ─── Noise Filtering (§3.3) ─────────────────────────────────────────

const BLOCKED_PREFIXES = new Set([
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "notifications",
  "notification",
  "support",
  "billing",
  "mailer-daemon",
  "system",
  "alerts",
  "alert",
  "info",
  "updates",
  "update",
  "feedback",
  "postmaster",
  "bounce",
  "unsubscribe",
  "newsletter",
  "news",
  "marketing",
  "promo",
  "promotions",
  "team",
  "hello",
  "contact",
  "admin",
  "webmaster",
  "service",
  "accounts",
  "account",
  "welcome",
  "auto",
  "automated",
]);

/**
 * Checks if an email looks like a transactional / automated sender.
 * Matches exact prefix, or prefix followed by delimiter (., -, _) or digits.
 */
export function isBlockedPrefix(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const clean = email.toLowerCase().trim();
  const atIdx = clean.indexOf("@");
  const local = (atIdx === -1 ? clean : clean.slice(0, atIdx)).trim();
  if (!local) return false;

  // Exact match
  if (BLOCKED_PREFIXES.has(local)) return true;

  // Delimited or numerical prefix match (e.g. "no-reply-123", "notifications.billing")
  for (const prefix of BLOCKED_PREFIXES) {
    if (local.startsWith(prefix)) {
      const nextChar = local.charAt(prefix.length);
      if (nextChar === "." || nextChar === "-" || nextChar === "_" || (nextChar >= "0" && nextChar <= "9")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks Gmail message headers for bulk / list markers.
 * Returns true if the message appears automated.
 */
export function isBulkMessage(headers: Record<string, string>): boolean {
  if (!headers || typeof headers !== "object") return false;

  if (headers["list-unsubscribe"]) return true;
  const precedence = headers["precedence"]?.toLowerCase();
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") return true;

  const autoSubmitted = headers["auto-submitted"]?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;

  return false;
}

/**
 * Explains why a message or sender was filtered (for metadata persistence).
 */
export function getFilterReason(
  senderEmail: string | null | undefined,
  headers: Record<string, string> = {}
): string | null {
  if (senderEmail && isBlockedPrefix(senderEmail)) {
    return `Blocked sender prefix in: ${senderEmail}`;
  }
  if (headers["list-unsubscribe"]) {
    return "List-Unsubscribe header present";
  }
  if (headers["precedence"] === "bulk" || headers["precedence"] === "list") {
    return `Precedence header: ${headers["precedence"]}`;
  }
  if (headers["auto-submitted"] && headers["auto-submitted"] !== "no") {
    return `Auto-Submitted header: ${headers["auto-submitted"]}`;
  }
  return null;
}

/**
 * Extracts a flat key→value map from Gmail message header arrays.
 */
export function parseGmailHeaders(
  headers: Array<{ name: string; value: string }> | null | undefined
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(headers)) return map;

  for (const h of headers) {
    if (h && typeof h.name === "string" && typeof h.value === "string") {
      map[h.name.toLowerCase()] = h.value;
    }
  }
  return map;
}

/**
 * Extracts all email addresses from a header value like:
 *   "Alice <alice@example.com>, bob@example.com"
 * Handles null, undefined, empty, and very large inputs safely.
 */
export function extractEmailsFromHeader(headerValue: string | null | undefined): string[] {
  if (!headerValue || typeof headerValue !== "string") return [];
  const safeHeader = headerValue.length > 100000 ? headerValue.slice(0, 100000) : headerValue;
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = safeHeader.match(regex);
  if (!matches) return [];

  // Deduplicate and canonicalize
  const results = new Set<string>();
  for (const email of matches) {
    results.add(email.toLowerCase());
  }
  return Array.from(results);
}
