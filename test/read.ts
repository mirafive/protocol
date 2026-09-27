import { readFileSync } from "node:fs"

export const root = new URL("../", import.meta.url)

export const readText = (path: string): string => readFileSync(new URL(path, root), "utf8")

export const readJson = <T>(path: string): T => JSON.parse(readText(path)) as T

/** mulberry32: deterministic test ids, never from `crypto`. */
export const prng = (seed: number): (() => number) => {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export const uuidV7s = (count: number, seed: number): string[] => {
  const random = prng(seed)
  const hex = (digits: number): string =>
    Array.from({ length: digits }, () => Math.floor(random() * 16).toString(16)).join("")

  return Array.from({ length: count }, (_, index) => {
    const time = (1_727_000_000_000 + index * 37).toString(16).padStart(12, "0")
    const variant = (8 + Math.floor(random() * 4)).toString(16)

    return `${time.slice(0, 8)}-${time.slice(8)}-7${hex(3)}-${variant}${hex(3)}-${hex(12)}`
  })
}
