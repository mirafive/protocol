import { expect, it } from "vitest"

import { batchIdFor } from "../src/batch-id.ts"
import { readJson } from "./read.ts"

const { cases } = readJson<{ cases: readonly { key: string; batch: string }[] }>(
  "fixtures/batch-id.cases.json"
)

it("has enough vectors, a long key and non-ASCII among them", () => {
  expect(cases.length).toBeGreaterThanOrEqual(8)
  expect(cases.some(({ key }) => key.length >= 300)).toBe(true)
  expect(cases.some(({ key }) => /[\u{80}-\u{10ffff}]/u.test(key))).toBe(true)
})

it.each(cases)("derives $batch", async ({ key, batch }) => {
  expect(await batchIdFor(key)).toBe(batch)
})

it("derives the idempotent example batch from its key", async () => {
  const example = readJson<{ batch: string }>("fixtures/batches/server-idempotent.json")

  expect(await batchIdFor("order-981")).toBe(example.batch)
})
