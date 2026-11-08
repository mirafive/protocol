/**
 * Validates events and batches exactly as the MIRA FIVE ingest does, without dependencies. For
 * SDK test suites, for integrations in other languages (`mirafive-validate`, see `cli.ts`), and
 * for checking an event before sending it.
 *
 * The rules mirror the ingest's own schema; the MIRA FIVE monorepo runs the same inputs through
 * both on every build and fails when they disagree.
 */
import {
  billingIntervals,
  consentStates,
  externalIdTypes,
  LIMITS,
  revenueKinds,
  touchpointChannels,
  touchpointKinds,
} from "./wire";

/** One problem: where (`events.0.revenue.amount`) and what. */
export interface Issue {
  path: string;
  message: string;
}

type Check = (value: unknown, path: string, issues: Issue[]) => void;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const join = (path: string, key: string | number) => (path ? `${path}.${key}` : String(key));

const UUID =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
const DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/** ISO 8601 date and time with `Z` or an offset, as the ingest accepts it. */
export function isDateTime(value: string): boolean {
  const match = DATETIME.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return (
    Number(month) >= 1 &&
    Number(month) <= 12 &&
    Number(day) >= 1 &&
    Number(day) <= days &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59 &&
    (offsetHour === undefined || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59))
  );
}

const string =
  (options: {
    min?: number;
    max: number;
    trim?: boolean;
    pattern?: RegExp;
    hint?: string;
  }): Check =>
  (value, path, issues) => {
    if (typeof value !== "string") {
      issues.push({ path, message: "expected a string" });
      return;
    }
    const text = options.trim ? value.trim() : value;
    if (options.min !== undefined && text.length < options.min) {
      issues.push({ path, message: `at least ${options.min} character(s)` });
    } else if (text.length > options.max) {
      issues.push({ path, message: `at most ${options.max} characters` });
    }
    if (options.pattern && !options.pattern.test(text)) {
      issues.push({ path, message: options.hint ?? "invalid format" });
    }
  };

const dateTime: Check = (value, path, issues) => {
  if (typeof value !== "string" || !isDateTime(value)) {
    issues.push({ path, message: "expected an ISO 8601 date and time with Z or an offset" });
  }
};

const oneOf =
  (values: readonly string[]): Check =>
  (value, path, issues) => {
    if (typeof value !== "string" || !values.includes(value)) {
      issues.push({ path, message: `expected one of ${values.join(", ")}` });
    }
  };

const integer =
  (min: number, max: number): Check =>
  (value, path, issues) => {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      {
        issues.push({ path, message: "expected an integer" });
        return;
      }
    }
    if (value < min || value > max) issues.push({ path, message: `expected ${min} to ${max}` });
  };

const number =
  (options: { min?: number; max?: number; positive?: boolean; int?: boolean }): Check =>
  (value, path, issues) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      {
        issues.push({ path, message: "expected a number" });
        return;
      }
    }
    if (options.int && !Number.isInteger(value))
      issues.push({ path, message: "expected an integer" });
    if (options.positive && value <= 0)
      issues.push({ path, message: "expected a positive number" });
    if (options.min !== undefined && value < options.min) {
      issues.push({ path, message: `at least ${options.min}` });
    }
    if (options.max !== undefined && value > options.max) {
      issues.push({ path, message: `at most ${options.max}` });
    }
  };

/** An object with optional fields; unknown fields are allowed (the ingest ignores them). */
const object =
  (fields: Record<string, Check>, required: string[] = []): Check =>
  (value, path, issues) => {
    if (!isObject(value)) {
      issues.push({ path, message: "expected an object" });
      return;
    }
    for (const [key, check] of Object.entries(fields)) {
      if (value[key] === undefined) {
        if (required.includes(key)) issues.push({ path: join(path, key), message: "required" });
        continue;
      }
      check(value[key], join(path, key), issues);
    }
  };

const scalar = (value: unknown) =>
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" && value.length <= LIMITS.stringLength);

const properties: Check = (value, path, issues) => {
  if (!isObject(value)) {
    issues.push({ path, message: "expected an object" });
    return;
  }
  const keys = Object.keys(value);
  for (const key of keys) {
    const at = join(path, key);
    if (key.length < 1 || key.length > LIMITS.propertyKeyLength) {
      issues.push({ path: at, message: `keys have 1 to ${LIMITS.propertyKeyLength} characters` });
    }
    const item = value[key];
    if (item === null || scalar(item)) continue;
    if (Array.isArray(item)) {
      if (item.length > LIMITS.arrayLength) {
        issues.push({ path: at, message: `at most ${LIMITS.arrayLength} items` });
      }
      item.forEach((entry, index) => {
        if (!scalar(entry)) {
          issues.push({ path: join(at, index), message: "expected a string, number or boolean" });
        }
      });
      continue;
    }
    issues.push({
      path: at,
      message:
        typeof item === "string"
          ? `at most ${LIMITS.stringLength} characters`
          : "expected a string, number, boolean, null or a list of them (nested objects are flattened by the SDKs)",
    });
  }
  if (keys.length > LIMITS.propertyKeys) {
    issues.push({ path, message: `at most ${LIMITS.propertyKeys} properties per event` });
  }
};

const short = string({ max: LIMITS.stringLength });
const url = string({ max: LIMITS.urlLength });
const size = integer(0, 20_000);

const context = object({
  page: object({ url, referrer: url, title: short }),
  app: object({ name: short, version: short, build: short, namespace: short }),
  device: object({
    type: oneOf(["desktop", "mobile", "tablet", "tv", "other"]),
    manufacturer: short,
    model: short,
  }),
  os: object({ name: short, version: short }),
  screen: object({ width: size, height: size, density: number({ positive: true, max: 10 }) }),
  viewport: object({ width: size, height: size }),
  locale: string({ max: 35 }),
  languages: (value, path, issues) => {
    if (!Array.isArray(value)) {
      issues.push({ path, message: "expected a list" });
      return;
    }
    if (value.length > 10) issues.push({ path, message: "at most 10 languages" });
    value.forEach((entry, index) => string({ max: 35 })(entry, join(path, index), issues));
  },
  timezone: string({ max: 64 }),
  location: object(
    {
      latitude: number({ min: -90, max: 90 }),
      longitude: number({ min: -180, max: 180 }),
    },
    ["latitude", "longitude"],
  ),
  library: object({ name: string({ max: 50 }), version: string({ max: 30 }) }, ["name", "version"]),
  ip: string({ max: 45 }),
  user_agent: string({ max: 1024 }),
});

const consentState = oneOf(consentStates);
const consent: Check = (value, path, issues) => {
  if (value === "not_applicable") return;
  if (!isObject(value)) {
    {
      issues.push({ path, message: 'expected { analytics, marketing } or "not_applicable"' });
      return;
    }
  }
  object({ analytics: consentState, marketing: consentState }, ["analytics"])(value, path, issues);
};

const minor = integer(-1e15, 1e15);
const id = string({ max: LIMITS.idLength });
const revenue = object(
  {
    amount: minor,
    currency: string({ min: 3, max: 3, hint: "an ISO 4217 code" }),
    entry_id: id,
    kind: oneOf(revenueKinds),
    fee: minor,
    tax: minor,
    refund_of: id,
    product: id,
    subscription: object(
      {
        id: string({ min: 1, max: LIMITS.idLength }),
        interval: oneOf(billingIntervals),
        interval_count: integer(1, 36),
        period_start: dateTime,
        period_end: dateTime,
      },
      ["id"],
    ),
  },
  ["amount", "currency"],
);

const externalIds: Check = (value, path, issues) => {
  if (!isObject(value)) {
    issues.push({ path, message: "expected an object" });
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (!(externalIdTypes as readonly string[]).includes(key)) {
      issues.push({
        path: join(path, key),
        message: `expected one of ${externalIdTypes.join(", ")}`,
      });
    } else if (item !== undefined) {
      string({ min: 1, max: LIMITS.idLength })(item, join(path, key), issues);
    }
  }
};

const text = string({ max: 200, trim: true });
const touchpoint = object(
  {
    kind: oneOf(touchpointKinds),
    channel: oneOf(touchpointChannels),
    source: text,
    medium: text,
    campaign: text,
    content: text,
    campaign_id: text,
    ad_group_id: text,
    ad_id: text,
    code: text,
    answer: string({ max: 500, trim: true }),
    external_ref: text,
  },
  ["kind"],
);

const event = object(
  {
    event_id: string({ max: 36, pattern: UUID, hint: "expected a UUID" }),
    type: oneOf(["track", "page", "screen", "identify", "group"]),
    event: string({
      min: 1,
      max: LIMITS.nameLength,
      pattern: /^\P{Cc}+$/u,
      hint: "no control characters",
    }),
    timestamp: dateTime,
    anonymous_id: id,
    user_id: id,
    session_id: id,
    group_id: id,
    properties,
    traits: properties,
    external_ids: externalIds,
    revenue,
    context,
    consent,
  },
  ["event_id", "type", "event"],
);

/** Every problem the ingest would reject this event for; an empty list means it is accepted. */
export function validateEvent(value: unknown, path = ""): Issue[] {
  const issues: Issue[] = [];
  event(value, path, issues);
  if (isObject(value) && value.event === "$touchpoint") {
    if (value.type !== "track") {
      issues.push({ path: join(path, "type"), message: "$touchpoint is a track event" });
    }
    const props = isObject(value.properties) ? value.properties : {};
    const before = issues.length;
    touchpoint(props, join(path, "properties"), issues);
    const source = typeof props.source === "string" ? props.source.trim() : "";
    if (issues.length === before && !props.channel && !source) {
      issues.push({
        path: join(path, "properties.source"),
        message: "a touchpoint needs a channel or a source",
      });
    }
  }
  return issues;
}

/**
 * Problems with the batch envelope (key, sent_at, stream, seq, 1 to 100 events) and with each
 * event. The ingest rejects a bad envelope as a whole and a bad event on its own.
 */
export function validateBatch(value: unknown): Issue[] {
  const issues: Issue[] = [];
  object({
    key: string({ max: 100 }),
    sent_at: dateTime,
    stream: string({ min: 1, max: 64 }),
    seq: integer(1, 2_147_483_647),
  })(value, "", issues);
  if (!isObject(value)) return issues;
  const events = value.events;
  if (!Array.isArray(events)) {
    issues.push({ path: "events", message: "expected a list of events" });
    return issues;
  }
  if (events.length < 1 || events.length > LIMITS.eventsPerBatch) {
    issues.push({ path: "events", message: `1 to ${LIMITS.eventsPerBatch} events per batch` });
  }
  events.forEach((item, index) => issues.push(...validateEvent(item, join("events", index))));
  return issues;
}
