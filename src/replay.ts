import { UUID } from "./validate";
import type { SignalsAnswer } from "./signals";
import type { BatchResult, ConsentState } from "./wire";

/**
 * The wire format of session recordings: the `replay` field of a batch's `202`, the chunk route
 * `POST /v1/replay` and the withdrawal `POST /v1/replay/withdraw`. The MIRA FIVE ingest checks its
 * own schema against these on every build. Browser-safe, no dependencies.
 */

export const REPLAY_LIMITS = {
  /** The gzip body of one chunk, in bytes. */
  chunkBytes: 1024 * 1024,
  /** What a browser lets `sendBeacon` and `fetch(…, { keepalive: true })` carry on page hide. */
  beaconBytes: 64 * 1024,
  /** Pages one chunk may name. */
  pagesPerChunk: 20,
  /** Characters of one page path. */
  pathLength: 512,
  /** The most tabs one session records in; a chunk of a further tab is refused. */
  tabsPerSession: 20,
  /** The highest sequence number of a session's tab. */
  maxSequence: 100_000,
  /** The longest time one chunk may cover, in ms. */
  chunkSpanMs: 60 * 60 * 1000,
  /** How long after a session's decision its chunks are taken, in ms (the decision's lifetime). */
  sessionMs: 24 * 60 * 60 * 1000,
  /** How far a chunk's corrected end may lie in the future, in ms. */
  futureMs: 60 * 60 * 1000,
  /** Characters of a page pattern; patterns per list are the project settings' business. */
  patternLength: 200,
} as const;

/**
 * How much the recorder masks. Every form input is masked in both.
 * - `standard`: text is masked on the pages marked sensitive.
 * - `strict`: text is masked on every page.
 */
export const maskingModes = ["standard", "strict"] as const;
export type MaskingMode = (typeof maskingModes)[number];

/**
 * Whether `path` matches `pattern`: a path starting with `/`, where `*` stands for any run of
 * characters (`/` included). It matches a page's whole path (`location.pathname`, as the browser
 * has it: not decoded, without query or fragment), case-sensitively. `/account/*` matches
 * `/account/` and `/account/orders/7`, not `/account`; `/checkout*` matches all three of
 * `/checkout`, `/checkout/` and `/checkout/payment`.
 */
export function matchesPage(pattern: string, path: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === path;
  const first = parts[0] ?? "";
  const last = parts.at(-1) ?? "";
  if (!path.startsWith(first) || path.length < first.length + last.length) return false;
  if (!path.endsWith(last)) return false;
  let at = first.length;
  const end = path.length - last.length;
  for (const part of parts.slice(1, -1)) {
    const found = path.indexOf(part, at);
    if (found === -1 || found + part.length > end) return false;
    at = found + part.length;
  }
  return true;
}

/** Whether `path` matches any of `patterns` (`matchesPage`). */
export function matchesAnyPage(patterns: readonly string[], path: string): boolean {
  return patterns.some((pattern) => matchesPage(pattern, path));
}

/**
 * The `replay` field of a batch's `202`: this session is recorded. Present only when the batch's
 * latest event (in time) has analytics consent and its session was chosen; absent otherwise, never
 * `null`. Every batch of a recorded session carries it, with the project's current settings.
 */
export interface ReplayAnswer {
  /** The session the server gave out. Every chunk names it. */
  session_id: string;
  masking: MaskingMode;
  /** Page patterns never recorded: the recorder records and sends nothing on these pages. */
  never_record: string[];
  /** Page patterns marked sensitive: all text is masked on them (`strict` masks it everywhere). */
  sensitive: string[];
}

/**
 * The body of a batch's `202`: `BatchResult`, for a recorded session `replay`, and for a project
 * that detects behavior signals `signals` (signals.ts).
 */
export interface BatchAnswer extends BatchResult {
  replay?: ReplayAnswer;
  signals?: SignalsAnswer;
}

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isMasking = (value: unknown): value is MaskingMode =>
  maskingModes.some((mode) => mode === value);

/**
 * The `replay` field of a batch answer as the ingest's schema reads it, or `undefined` when it is
 * missing or malformed. Takes the whole answer body; unknown keys are dropped.
 */
export function readReplayAnswer(body: unknown): ReplayAnswer | undefined {
  const replay = isRecord(body) ? body.replay : undefined;
  if (!isRecord(replay)) return undefined;
  const { session_id, masking, never_record, sensitive } = replay;
  if (typeof session_id !== "string" || !UUID.test(session_id)) return undefined;
  if (!isMasking(masking) || !strings(never_record) || !strings(sensitive)) return undefined;
  return { session_id, masking, never_record: [...never_record], sensitive: [...sensitive] };
}

/**
 * A tab's id in a recording: 8 to 32 characters of `A`–`Z`, `a`–`z`, `0`–`9`, `_` and `-` (the
 * alphabet of base64url). The recorder makes one per tab at random and keeps it for the tab's
 * documents; the server makes it a segment of the chunk's storage key, so nothing else passes.
 */
export const TAB_ID = /^[A-Za-z0-9_-]{8,32}$/;

/** Whether `value` is a tab id (`TAB_ID`). */
export function isTabId(value: string): boolean {
  return TAB_ID.test(value);
}

/**
 * The query string of a chunk, `POST /v1/replay?…`. Everything rides in the URL, because the body
 * is the gzip of the recording (a JSON array of rrweb events) and a header would cost a CORS
 * preflight.
 */
export interface ChunkQuery {
  /** The project's public key. */
  key: string;
  /** The `session_id` of the `replay` field. */
  session: string;
  /**
   * The tab the chunk was recorded in (`TAB_ID`): a recording is one stream per tab, since two
   * tabs of one visit share the session.
   */
  tab: string;
  /** 0 for the tab's first chunk of the session, then +1 per chunk, across the tab's pages; a retry sends the same. */
  seq: number;
  /** The time of the chunk's first and last recorded event, epoch ms on the browser's clock. */
  start: number;
  end: number;
  /** When the chunk was sent, epoch ms on the browser's clock, to correct its skew. */
  sent: number;
  /** The paths of the pages the chunk covers (`location.pathname`), 1 to 20. */
  page: string[];
  /** The consent the chunk was recorded under, as on every event. */
  consent_analytics: ConsentState;
  consent_marketing: ConsentState;
  /** The visitor's ids as the events carry them. */
  anonymous_id?: string;
  user_id?: string;
}

/** The query string of `POST /v1/replay/withdraw?…`: consent was withdrawn, delete the recording. */
export interface WithdrawQuery {
  key: string;
  session: string;
}

/** The URL of a chunk: `host` and the query, with one `page` parameter per page. */
export function replayChunkUrl(host: string, query: ChunkQuery): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) search.append(name, String(item));
    else search.append(name, String(value));
  }
  return `${host}/v1/replay?${search}`;
}

/** The URL of a withdrawal. */
export function replayWithdrawUrl(host: string, query: WithdrawQuery): string {
  return `${host}/v1/replay/withdraw?${new URLSearchParams({ key: query.key, session: query.session })}`;
}

/**
 * Why a chunk is refused with `409`; the recorder stops recording the session on each of them.
 * - `session_not_recorded`: the session was not chosen, its consent was withdrawn, replay was
 *   turned off, or the decision is gone (more than 24 hours, or the server could not keep it).
 * - `consent_required`: the chunk names no analytics consent.
 * - `page_not_recorded`: the chunk names a page the project never records.
 */
export const chunkRefusals = [
  "session_not_recorded",
  "consent_required",
  "page_not_recorded",
] as const;
export type ChunkRefusal = (typeof chunkRefusals)[number];

/** Whether a body is gzip (RFC 1952): its magic bytes and the deflate method. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 18 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08;
}
