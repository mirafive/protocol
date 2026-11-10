import { describe, expect, test } from "bun:test";

import fixtures from "../fixtures/event-ids.json";
import {
  backoffMs,
  eventIdFor,
  isUuid,
  keyKind,
  retryable,
  retryAfterMs,
  toConsent,
  trimHost,
} from "./helpers";
import { cleanExternalIds, cleanProperties } from "./properties";
import { personErasurePath } from "./wire";

describe("eventIdFor", () => {
  test.each(fixtures.cases)("$key gives the shared fixture id", async ({ key, id }) => {
    expect(await eventIdFor(key)).toBe(id);
  });

  test("is a UUIDv8 the ingest accepts", async () => {
    const id = await eventIdFor("order:1");
    expect(id[14]).toBe("8");
    expect(isUuid(id)).toBe(true);
  });
});

describe("toConsent", () => {
  test("maps booleans to states and keeps not_applicable", () => {
    expect(toConsent({ analytics: true })).toEqual({ analytics: "granted", marketing: "unknown" });
    expect(toConsent({ analytics: false, marketing: "granted" })).toEqual({
      analytics: "denied",
      marketing: "granted",
    });
    expect(toConsent("not_applicable")).toBe("not_applicable");
    expect(toConsent(undefined)).toBe("not_applicable");
  });
});

describe("keyKind", () => {
  test("tells public from secret keys", () => {
    expect(keyKind("mira_pk_abc")).toBe("public");
    expect(keyKind("mira_sk_abc")).toBe("secret");
    expect(keyKind("something")).toBe("unknown");
    expect(keyKind(undefined)).toBe("unknown");
  });
});

describe("delivery helpers", () => {
  test("retries timeouts, rate limits and server errors only", () => {
    expect([408, 429, 500, 503].every(retryable)).toBe(true);
    expect([400, 401, 402, 403, 413].some(retryable)).toBe(false);
  });

  test("backoff stays under the cap and honours Retry-After", () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(backoffMs(attempt)).toBeLessThanOrEqual(30_000);
    }
    expect(backoffMs(0, 5_000)).toBe(5_000);
  });

  test("reads Retry-After as seconds or a date", () => {
    expect(retryAfterMs("3")).toBe(3_000);
    expect(retryAfterMs(null)).toBe(0);
    expect(retryAfterMs("soon")).toBe(0);
    const now = Date.parse("2026-11-08T12:00:00Z");
    expect(retryAfterMs("Sun, 08 Nov 2026 12:00:10 GMT", now)).toBe(10_000);
  });

  test("trims trailing slashes from the host", () => {
    expect(trimHost("https://events.mirafive.io//")).toBe("https://events.mirafive.io");
  });
});

describe("cleanProperties", () => {
  test("flattens objects, converts dates and drops what the wire cannot carry", () => {
    const at = new Date("2026-01-02T03:04:05.000Z");
    expect(
      cleanProperties({
        plan: { name: "pro", seats: 3 },
        at,
        tags: ["a", 1, { nested: true }, null],
        skip: undefined,
        call: () => 1,
        big: 10n,
        nan: Number.NaN,
      }),
    ).toEqual({
      "plan.name": "pro",
      "plan.seats": 3,
      at: "2026-01-02T03:04:05.000Z",
      tags: ["a", 1],
      big: "10",
      nan: null,
    });
  });

  test("applies the limits", () => {
    const many = Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`k${index}`, index]));
    expect(Object.keys(cleanProperties(many))).toHaveLength(64);
    expect(cleanProperties({ text: "x".repeat(3000) }).text).toHaveLength(2048);
    expect(cleanProperties({ list: Array.from({ length: 60 }, () => 1) }).list).toHaveLength(50);
    expect(cleanProperties({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({});
    expect(cleanProperties("not an object")).toEqual({});
  });
});

describe("cleanExternalIds", () => {
  test("keeps known types with usable values and never truncates an id", () => {
    expect(
      cleanExternalIds({
        stripe_customer: "cus_1",
        unknown: "x",
        shopify_customer: "y".repeat(201),
      }),
    ).toEqual({ stripe_customer: "cus_1" });
    expect(cleanExternalIds({ stripe_customer: " " })).toBeUndefined();
    expect(cleanExternalIds(null)).toBeUndefined();
  });
});

describe("personErasurePath", () => {
  test("encodes the user id as one path segment", () => {
    expect(personErasurePath("cust-1")).toBe("/v1/persons/cust-1");
    expect(personErasurePath("a/b@c.de ")).toBe("/v1/persons/a%2Fb%40c.de%20");
  });
});
