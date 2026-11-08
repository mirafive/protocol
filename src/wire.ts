/**
 * The MIRA FIVE wire format, as plain TypeScript: what every SDK sends to `/v1/batch`.
 *
 * The server validates it with Zod (`packages/schema` in the MIRA FIVE monorepo); `wire.test.ts`
 * proves both describe the same shape, so these types cannot drift from what the ingest accepts.
 * Keeping Zod out of here keeps every SDK free of runtime dependencies.
 */

/** The ingest every SDK talks to unless told otherwise. */
export const DEFAULT_HOST = "https://events.mirafive.io";

/** Limits the ingest enforces. SDKs apply them before sending, so one bad value never costs an event. */
export const LIMITS = {
  eventsPerBatch: 100,
  nameLength: 120,
  propertyKeys: 64,
  propertyKeyLength: 100,
  stringLength: 2048,
  arrayLength: 50,
  urlLength: 4096,
  idLength: 200,
  /** Events older than this are rejected unless they come with a secret key (backfills). */
  maxClientAgeDays: 7,
} as const;

/** Event names MIRA defines. Your own event names must not start with `$`. */
export const reservedEvents = [
  "$pageview",
  "$screen",
  "$identify",
  "$group",
  "$consent_changed",
  "$revenue",
  "$app_install",
  "$app_open",
  "$touchpoint",
  "$engagement",
  "$outbound_click",
  "$file_download",
  "$form_submit",
  // A deal of the project's pipeline reached a stage, or was lost (secret keys only).
  "$deal_stage",
  "$deal_lost",
] as const;
export type ReservedEvent = (typeof reservedEvents)[number];

/**
 * The properties of `$deal_stage`: one deal (a case, an order, an opportunity) reached a stage
 * of the project's pipeline. `value` is what the deal is expected to be worth now, in minor units
 * of the project's reporting currency; MIRA FIVE keeps the latest. Other properties are kept.
 */
export interface DealStageProperties {
  deal_id: string;
  stage: string;
  value?: number;
}

/** The properties of `$deal_lost`: the deal will not reach the end of the pipeline. */
export interface DealLostProperties {
  deal_id: string;
  reason?: string;
}

export const DEAL_LIMITS = { idLength: 200, stageLength: 120, reasonLength: 200 } as const;

/** One purpose's state. `unknown`: the banner is still open, so the event is collected at tier 0. */
export const consentStates = ["granted", "denied", "unknown"] as const;
export type ConsentState = (typeof consentStates)[number];

/**
 * The consent an event was collected under. Server SDKs send `not_applicable` for facts only the
 * server knows, such as a paid invoice.
 */
export type Consent = { analytics: ConsentState; marketing?: ConsentState } | "not_applicable";

/** Property values: scalars, or arrays of scalars. SDKs flatten nested objects to dot keys. */
export type PropertyValue = string | number | boolean | null | (string | number | boolean)[];
export type Properties = Record<string, PropertyValue>;

/** Ids of the same person in other systems, so connectors can link their money to the user. */
export const externalIdTypes = [
  "stripe_customer",
  "revenuecat_app_user",
  "shopify_customer",
  "shopware_customer",
] as const;
export type ExternalIdType = (typeof externalIdTypes)[number];
export type ExternalIds = Partial<Record<ExternalIdType, string>>;

/** What a ledger entry is: one-time money, a subscription payment, or money taken back. */
export const revenueKinds = [
  "charge",
  "subscription_payment",
  "refund",
  "dispute",
  "dispute_won",
] as const;
export type RevenueKind = (typeof revenueKinds)[number];

/** How often a subscription bills: every `interval_count` days, weeks, months or years. */
export const billingIntervals = ["day", "week", "month", "year"] as const;
export type BillingInterval = (typeof billingIntervals)[number];

/** Money on an event, in integer minor units. Only secret keys may send it. */
export interface Revenue {
  /** Gross, tax included. Negative for a refund or dispute. */
  amount: number;
  /** ISO 4217, for example `EUR`. */
  currency: string;
  /** The provider object (`stripe:ch_123`); the ledger keeps one entry per id. */
  entry_id?: string;
  kind?: RevenueKind;
  fee?: number;
  tax?: number;
  refund_of?: string;
  product?: string;
  subscription?: {
    id: string;
    interval?: BillingInterval;
    interval_count?: number;
    period_start?: string;
    period_end?: string;
  };
}

/** Touchpoints that are not a visit: a survey answer, an offline contact, a redeemed code. */
export const touchpointKinds = ["survey", "offline", "code", "custom"] as const;
export type TouchpointKind = (typeof touchpointKinds)[number];

/** The kinds a public key (browser, app) may send. The others need a secret key. */
export const publicTouchpointKinds = ["survey"] as const satisfies readonly TouchpointKind[];

/** MIRA's channels a touchpoint may name. */
export const touchpointChannels = [
  "paid_search",
  "paid_social",
  "paid_other",
  "organic_search",
  "organic_social",
  "ai_assistant",
  "email",
  "affiliate",
  "display",
  "video",
  "qr",
  "app_store",
  "referral",
  "direct",
] as const;
export type TouchpointChannel = (typeof touchpointChannels)[number];

/** What the SDK knows about where and how the event happened. */
export interface EventContext {
  page?: { url?: string; referrer?: string; title?: string };
  app?: { name?: string; version?: string; build?: string; namespace?: string };
  device?: {
    type?: "desktop" | "mobile" | "tablet" | "tv" | "other";
    manufacturer?: string;
    model?: string;
  };
  os?: { name?: string; version?: string };
  screen?: { width?: number; height?: number; density?: number };
  viewport?: { width?: number; height?: number };
  locale?: string;
  languages?: string[];
  timezone?: string;
  /** A location the site or app already has. MIRA rounds it to 2 decimals (about 1 km). */
  location?: { latitude: number; longitude: number };
  library?: { name: string; version: string };
  /** Server SDKs only: the end user's IP and user agent, for geo and device. Never stored. */
  ip?: string;
  user_agent?: string;
}

/** One event on the wire. */
export interface WireEvent {
  /** UUIDv7 made by the SDK. The same id twice is one event. */
  event_id: string;
  type: "track" | "page" | "screen" | "identify" | "group";
  event: string;
  timestamp?: string;
  /** Only with analytics consent. */
  anonymous_id?: string;
  user_id?: string;
  session_id?: string;
  group_id?: string;
  properties?: Properties;
  traits?: Properties;
  external_ids?: ExternalIds;
  revenue?: Revenue;
  context?: EventContext;
  consent?: Consent;
}

/** A batch, to `/v1/batch` (JSON) or `/v1/p` (`text/plain`, from `sendBeacon`). */
export interface WireBatch {
  key?: string;
  sent_at?: string;
  /** A random id per SDK instance, in memory only. */
  stream?: string;
  /** The stream's batch number from 1. A retry resends the same number. */
  seq?: number;
  events: WireEvent[];
}

/** The ingest's answer. Per-event problems are listed, never thrown. */
export interface BatchResult {
  accepted: number;
  duplicates: number;
  rejected: { index: number; reason: string }[];
}
