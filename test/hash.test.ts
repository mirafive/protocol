import { describe, expect, it } from "vitest"

import { BUCKETS, bucket, fnv1a32, SHARE_SALT, VARIANT_SALT } from "../src/hash.ts"
import { readJson, uuidV7s } from "./read.ts"

interface HashCases {
  readonly fnv1a32: readonly { readonly input: string; readonly hash: number }[]
  readonly bucket: readonly {
    readonly seed: string
    readonly salt: string
    readonly unit: string
    readonly bucket: number
  }[]
}

const cases = readJson<HashCases>("fixtures/flag-hash.cases.json")

const tenths = (units: readonly string[], seed: string, salt: string): number[] => {
  const counts = Array.from({ length: 10 }, () => 0)

  for (const unit of units) {
    counts[Math.floor(bucket(seed, salt, unit) / 1000)]! += 1
  }

  return counts
}

const chiSquare = (counts: readonly number[], expected: number): number =>
  counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0)

const families: Record<string, readonly string[]> = {
  uuidv7: uuidV7s(100_000, 42),
  sequential: Array.from({ length: 100_000 }, (_, index) => String(index + 1)),
  user: Array.from({ length: 100_000 }, (_, index) => `user_${index + 1}`)
}

describe("fnv1a32", () => {
  it.each(cases.fnv1a32)("hashes $input", ({ input, hash }) => {
    expect(fnv1a32(input)).toBe(hash)
  })

  it("matches the golden values", () => {
    expect([fnv1a32("abc"), fnv1a32("müller"), fnv1a32("user-42")]).toEqual([440920331, 1392138076, 39875499])
  })
})

describe("bucket", () => {
  it.each(cases.bucket)("$seed$salt$unit is $bucket", ({ seed, salt, unit, bucket: expected }) => {
    expect(bucket(seed, salt, unit)).toBe(expected)
  })

  it.each(Object.entries(families))("spreads %s units evenly over both salts", (_, units) => {
    for (const salt of [SHARE_SALT, VARIANT_SALT]) {
      expect(chiSquare(tenths(units, "3f9a1c0b7e2d", salt), units.length / 10)).toBeLessThan(21.666)
    }
  })

  it("draws two seeds independently", () => {
    const units = families["uuidv7"] ?? []
    const table = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0))

    for (const unit of units) {
      table[Math.floor(bucket("3f9a1c0b7e2d", SHARE_SALT, unit) / 1000)]![
        Math.floor(bucket("k3v9x0q2m7ta", SHARE_SALT, unit) / 1000)
      ]! += 1
    }

    const rows = table.map((row) => row.reduce((sum, count) => sum + count, 0))
    const columns = table[0]!.map((_, column) => table.reduce((sum, row) => sum + row[column]!, 0))
    const statistic = table.reduce(
      (sum, row, r) =>
        sum +
        row.reduce((inner, count, c) => {
          const expected = (rows[r]! * columns[c]!) / units.length

          return inner + (count - expected) ** 2 / expected
        }, 0),
      0
    )

    expect(statistic).toBeLessThan(126.083)
  })

  it("stays below the bucket count", () => {
    expect(
      Math.max(...(families["user"] ?? []).slice(0, 1000).map((unit) => bucket("a", VARIANT_SALT, unit)))
    ).toBeLessThan(BUCKETS)
  })
})
