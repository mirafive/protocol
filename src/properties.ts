import { externalIdTypes, LIMITS, type ExternalIds, type Properties } from "./wire";

const MAX_KEYS = LIMITS.propertyKeys;
const MAX_STRING = LIMITS.stringLength;
const MAX_KEY = LIMITS.propertyKeyLength;
const MAX_ARRAY = LIMITS.arrayLength;
const MAX_DEPTH = 3;

type Scalar = string | number | boolean | null;

function scalar(value: unknown): Scalar | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, MAX_STRING);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return undefined;
}

/**
 * Turns whatever the caller passes into properties the ingest accepts: nested objects are
 * flattened to dot keys (`plan.name`), dates become ISO strings, functions and `undefined` are
 * dropped, and every limit is applied here. The ingest validates each event on its own and
 * rejects the whole event on a violation, so trimming here keeps the rest of the data.
 */
export function cleanProperties(input: unknown): Properties {
  const output: Properties = {};
  let count = 0;

  const walk = (value: unknown, prefix: string, depth: number) => {
    if (!value || typeof value !== "object" || value instanceof Date) return;
    for (const [rawKey, item] of Object.entries(value)) {
      if (count >= MAX_KEYS) return;
      const key = (prefix ? `${prefix}.${rawKey}` : rawKey).slice(0, MAX_KEY);
      if (!key) continue;
      if (Array.isArray(item)) {
        const list = item
          .map(scalar)
          .filter(
            (entry): entry is string | number | boolean => entry !== undefined && entry !== null,
          );
        output[key] = list.slice(0, MAX_ARRAY);
        count += 1;
        continue;
      }
      const flat = scalar(item);
      if (flat !== undefined) {
        output[key] = flat;
        count += 1;
      } else if (item && typeof item === "object" && depth < MAX_DEPTH) {
        walk(item, key, depth + 1);
      }
    }
  };

  walk(input, "", 0);
  return output;
}

/**
 * Known types with usable values only; `undefined` when nothing is left. An id is never cut
 * short: a truncated id would link the money to the wrong person, so an overlong one is dropped.
 */
export function cleanExternalIds(input: unknown): ExternalIds | undefined {
  if (!input || typeof input !== "object") return undefined;
  const ids: ExternalIds = {};
  let found = false;
  for (const type of externalIdTypes) {
    const value: unknown = Reflect.get(input, type);
    if (typeof value === "string" && value.trim() && value.length <= LIMITS.idLength) {
      ids[type] = value;
      found = true;
    }
  }
  return found ? ids : undefined;
}
