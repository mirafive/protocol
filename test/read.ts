import { readFileSync } from "node:fs"

export const root = new URL("../", import.meta.url)

export const readText = (path: string): string => readFileSync(new URL(path, root), "utf8")

export const readJson = <T>(path: string): T => JSON.parse(readText(path)) as T
