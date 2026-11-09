import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";

import { isDateTime, validateBatch, validateEvent } from "./validate";

const dir = `${import.meta.dir}/../fixtures/batches`;
const read = (kind: string) =>
  readdirSync(`${dir}/${kind}`).map((file) => [file, require(`${dir}/${kind}/${file}`)] as const);

describe("fixtures", () => {
  test.each(read("valid"))("%s is accepted", (_, batch) => {
    expect(validateBatch(batch)).toEqual([]);
  });

  test.each(read("invalid"))("%s is rejected", (_, batch) => {
    expect(validateBatch(batch).length).toBeGreaterThan(0);
  });
});

describe("validateEvent", () => {
  test("names where the problem is", () => {
    expect(
      validateEvent({
        event_id: "0192d4a8-7b1c-7e8a-9c1d-2b3e4f5a6b7c",
        type: "track",
        event: "$revenue",
        revenue: { amount: 19.99, currency: "EUR" },
      }),
    ).toEqual([{ path: "revenue.amount", message: "expected an integer" }]);
  });

  test("still accepts the deprecated fee and tax, unchecked", () => {
    expect(
      validateEvent({
        event_id: "0192d4a8-7b1c-7e8a-9c1d-2b3e4f5a6b7c",
        type: "track",
        event: "$revenue",
        revenue: { amount: 1999, currency: "EUR", fee: 1.5, tax: 160 },
      }),
    ).toEqual([]);
  });

  test("checks a touchpoint's properties", () => {
    expect(
      validateEvent({
        event_id: "0192d4a8-7b1c-7e8a-9c1d-2b3e4f5a6b7c",
        type: "track",
        event: "$touchpoint",
        properties: { kind: "survey", source: "  " },
      }),
    ).toEqual([{ path: "properties.source", message: "a touchpoint needs a channel or a source" }]);
  });
});

test("isDateTime needs seconds and an offset", () => {
  expect(isDateTime("2026-11-08T12:00:00Z")).toBe(true);
  expect(isDateTime("2026-11-08T12:00:00.123+01:00")).toBe(true);
  expect(isDateTime("2026-11-08T12:00Z")).toBe(false);
  expect(isDateTime("2026-11-08T12:00:00")).toBe(false);
  expect(isDateTime("2026-02-30T12:00:00Z")).toBe(false);
});
