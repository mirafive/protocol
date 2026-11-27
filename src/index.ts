/**
 * `@mirafive/protocol`: the MIRA FIVE wire format and the helpers every SDK shares. No
 * dependencies; runs in browsers, Node, Bun, Deno, workers and Convex.
 *
 * Build your own integration on it, or read `batch.schema.json` (JSON Schema of a batch) from
 * another language.
 */
export * from "./wire";
export {
  backoffMs,
  consentState,
  eventIdFor,
  isUuid,
  keyKind,
  retryable,
  retryAfterMs,
  toConsent,
  trimHost,
  type ConsentInput,
} from "./helpers";
export { cleanExternalIds, cleanProperties } from "./properties";
export { piiKinds, redactPii, type PiiBlank, type PiiCounts, type PiiKind } from "./pii";
export {
  chunkRefusals,
  isGzip,
  maskingModes,
  matchesAnyPage,
  matchesPage,
  readReplayAnswer,
  REPLAY_LIMITS,
  replayChunkUrl,
  replayWithdrawUrl,
  type BatchAnswer,
  type ChunkQuery,
  type ChunkRefusal,
  type MaskingMode,
  type ReplayAnswer,
  type WithdrawQuery,
} from "./replay";
export { uuidv7 } from "./uuid";
export { isDateTime, validateBatch, validateEvent, type Issue } from "./validate";
