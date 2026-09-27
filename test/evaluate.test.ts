import { describe, expect, it } from "vitest"

import { evaluate, JUNK_IDS, LEVEL, usable } from "../src/evaluate.ts"
import type { Evaluation, Facts, Flag } from "../src/types.ts"
import { readJson, uuidV7s } from "./read.ts"

interface EvalCases {
  readonly level: number
  readonly junk: readonly string[]
  readonly cases: readonly {
    readonly name: string
    readonly flag: Flag
    readonly facts: Facts
    readonly expect: Evaluation
  }[]
}

const fixture = readJson<EvalCases>("fixtures/flag-eval.cases.json")

describe("evaluate", () => {
  it("is at the fixture's level with its junk list", () => {
    expect(LEVEL).toBe(fixture.level)
    expect(JUNK_IDS).toEqual(fixture.junk)
  })

  it.each(fixture.cases)("$name", ({ flag, facts, expect: expected }) => {
    expect(evaluate(flag, facts)).toEqual(expected)
  })

  it("keeps a unit inside every larger share", () => {
    const shares = [0, 1, 100, 1000, 2500, 5000, 9999, 10_000]

    for (const id of uuidV7s(2000, 7)) {
      const inside = shares.map(
        (sh) =>
          evaluate({ s: "3f9a1c0b7e2d", t: "b", u: "b", d: "off", r: [{ sh, w: [["on", 10_000]] }] }, { id })
            .reason === "SPLIT"
      )

      expect(inside).toEqual(inside.toSorted((a, b) => Number(a) - Number(b)))
    }
  })
})

describe("usable", () => {
  it.each([
    [undefined, undefined],
    [42, undefined],
    ["", undefined],
    [" \t", undefined],
    ['"Undefined"', undefined],
    ["NULL", undefined],
    ["x".repeat(256), "x".repeat(256)],
    ["x".repeat(257), undefined],
    [" user-42 ", " user-42 "],
    ["İD", "İD"]
  ])("usable(%j) is %j", (id, expected) => {
    expect(usable(id)).toBe(expected)
  })
})
