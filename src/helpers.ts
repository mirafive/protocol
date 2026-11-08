import type { Consent, ConsentState } from "./wire";

/** What callers may pass for one purpose: a plain boolean from a custom banner, or a wire state. */
export type ConsentInput = boolean | ConsentState | undefined;

/** `true` → granted, `false` → denied, nothing → unknown. */
export const consentState = (value: ConsentInput): ConsentState =>
  value === true ? "granted" : value === false ? "denied" : (value ?? "unknown");

/** Consent for an event from booleans or states; `not_applicable` passes through. */
export function toConsent(
  input: "not_applicable" | { analytics: ConsentInput; marketing?: ConsentInput } | undefined,
  fallback: Consent = "not_applicable",
): Consent {
  if (input === undefined) return fallback;
  if (input === "not_applicable") return input;
  return { analytics: consentState(input.analytics), marketing: consentState(input.marketing) };
}

/**
 * Which kind of key this is. Public keys (`mira_pk_…`) belong in browsers and apps; secret keys
 * (`mira_sk_…`) only on servers, because they may send revenue and backfills.
 */
export function keyKind(key: string | undefined): "public" | "secret" | "unknown" {
  if (!key) return "unknown";
  if (key.startsWith("mira_pk_")) return "public";
  if (key.startsWith("mira_sk_")) return "secret";
  return "unknown";
}

/** Strips trailing slashes, so `host + "/v1/batch"` is always one URL. */
export const trimHost = (host: string) => host.replace(/\/+$/, "");

/** Answers worth retrying: timeouts, rate limits and server errors. Other 4xx are final. */
export const retryable = (status: number) => status === 408 || status === 429 || status >= 500;

/**
 * Exponential backoff with full jitter, capped, but never sooner than the server asked
 * (`Retry-After`, in milliseconds).
 */
export function backoffMs(attempt: number, atLeastMs = 0, baseMs = 500, capMs = 30_000) {
  const ceiling = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.max(atLeastMs, Math.random() * ceiling);
}

/** `Retry-After` in milliseconds: seconds or an HTTP date. 0 when absent or unreadable. */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? 0 : Math.max(0, at - now);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A UUID of version 1 to 8 in the RFC 9562 variant, as the ingest accepts for `event_id`. */
export const isUuid = (value: string) => UUID.test(value);

/**
 * A stable event id from your own key, such as `order:123:paid`. The same key always gives the
 * same UUID, in every MIRA FIVE SDK and language, so a retried job, a backfill run twice, or the
 * browser and the server reporting one conversion all count once.
 * Format: UUIDv8 (RFC 9562) from the first 122 bits of SHA-256.
 */
export async function eventIdFor(key: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
  );
  digest[6] = (digest[6]! & 0x0f) | 0x80;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
