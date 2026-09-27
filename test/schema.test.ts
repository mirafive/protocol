import { readdirSync } from "node:fs"

import { Ajv2020 } from "ajv/dist/2020.js"
import { describe, expect, it } from "vitest"

import { readJson, readText, root } from "./read.ts"

const ajv = new Ajv2020({ strict: true, allErrors: true })
const batch = ajv.compile(readJson<object>("schema/batch.schema.json"))
const receipt = ajv.compile(readJson<object>("schema/receipt.schema.json"))
const error = ajv.compile(readJson<object>("schema/error.schema.json"))

const files = (directory: string): string[] =>
  readdirSync(new URL(directory, root)).filter((name) => name.endsWith(".json"))

describe("batch schema", () => {
  it.each(files("fixtures/batches/"))("accepts %s", (name) => {
    expect(batch(readJson(`fixtures/batches/${name}`)), JSON.stringify(batch.errors)).toBe(true)
  })

  it.each(files("fixtures/batches/invalid/"))("refuses %s", (name) => {
    expect(batch(readJson(`fixtures/batches/invalid/${name}`))).toBe(false)
  })

  it("accepts the example in PROTOCOL.md §3", () => {
    const section = readText("PROTOCOL.md").split("## 3. The batch")[1] ?? ""
    const example = /```json\n([\s\S]*?)```/.exec(section)?.[1] ?? ""

    expect(batch(JSON.parse(example)), JSON.stringify(batch.errors)).toBe(true)
  })

  it("accepts the batch every consentless rule allows", () => {
    expect(
      batch({
        v: 1,
        batch: "0192d4a8-7b1c-4e8a-9c1d-2b3e4f5a6b7c",
        mode: "consentless",
        context: { sdk: "mirafive-server/0.5.0" },
        events: [{ name: "$identify", unknownHint: true }]
      })
    ).toBe(true)
  })
})

describe("receipt and error schemas", () => {
  it("accepts receipts", () => {
    expect(receipt({ batch: "0192d4a8-7b1c-4e8a-9c1d-2b3e4f5a6b7c", accepted: 12, dropped: 0 })).toBe(true)
    expect(
      receipt({ batch: "0192d4a8-7b1c-4e8a-9c1d-2b3e4f5a6b7c", accepted: 0, dropped: 3, reason: "bot" })
    ).toBe(true)
    expect(
      receipt({ batch: "0192d4a8-7b1c-4e8a-9c1d-2b3e4f5a6b7c", accepted: 0, dropped: 3, reason: "other" })
    ).toBe(false)
  })

  it("accepts error bodies", () => {
    expect(
      error({
        code: "validation_failed",
        detail: "The batch does not match the event schema.",
        errors: [{ path: "events.0.name", message: "The name may not start with a dollar sign." }]
      })
    ).toBe(true)
    expect(error({ code: "rate_limited" })).toBe(false)
  })
})
