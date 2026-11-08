import { describe, expect, test } from "bun:test";

import { uuidv7 } from "./uuid";

const FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  test("has the RFC 9562 version and variant", () => {
    for (let index = 0; index < 100; index += 1) expect(uuidv7()).toMatch(FORMAT);
  });

  test("carries the millisecond timestamp in the first 48 bits", () => {
    // In the future, so the monotonic guard (never go back in time) does not apply.
    const at = Date.now() + 60_000;
    const ms = Number.parseInt(uuidv7(at).replaceAll("-", "").slice(0, 12), 16);
    expect(ms).toBe(at);
  });

  test("is strictly increasing, also within one millisecond", () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7());
    const sorted = ids.toSorted();
    expect(sorted).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("stays monotonic when the clock goes backwards", () => {
    const later = uuidv7(Date.now() + 10_000);
    const earlier = uuidv7(Date.now());
    expect(earlier > later).toBe(true);
  });
});
